import json
from typing import Any

from redis.asyncio import Redis
from redis.exceptions import ResponseError

from .config import settings
from .db import database
from .extractor import extract_entities
from .mapper import map_claim

STREAM_KEY = "document-ingestion"
DEAD_LETTER_STREAM = "document-ingestion-dead-letter"
CONSUMER_GROUP = "document-engine"
CONSUMER_NAME = "engine-1"


def _decode(value: Any) -> Any:
    return value.decode("utf-8") if isinstance(value, bytes) else value


def parse_stream_payload(fields: dict[Any, Any]) -> dict[str, str] | None:
    normalized = {_decode(key): _decode(value) for key, value in fields.items()}
    payload = normalized.get("payload")
    if not isinstance(payload, str):
        return None
    try:
        decoded = json.loads(payload)
    except json.JSONDecodeError:
        return None
    if not isinstance(decoded, dict):
        return None

    required = {"ingestionRunId", "documentId", "versionId", "extractionProfile"}
    if not required.issubset(decoded):
        return None
    if not all(isinstance(decoded[key], str) and decoded[key] for key in required):
        return None
    return {key: decoded[key] for key in required}


async def ensure_consumer_group(redis: Redis) -> None:
    try:
        await redis.xgroup_create(STREAM_KEY, CONSUMER_GROUP, id="0", mkstream=True)
    except ResponseError as error:
        if "BUSYGROUP" not in str(error):
            raise


async def process_job(payload: dict[str, str]) -> None:
    ingestion_run_id = payload["ingestionRunId"]
    document_id = payload["documentId"]
    version_id = payload["versionId"]
    extraction_profile = payload["extractionProfile"]

    await database.set_run_status(ingestion_run_id, "running")
    await database.set_document_status(document_id, "processing")
    try:
        if extraction_profile != "claims":
            raise ValueError("unsupported_extraction_profile")
        text_body = await database.fetch_version_text(version_id)
        entities = extract_entities(text_body)
        claim = map_claim(entities)
        await database.insert_entities(ingestion_run_id, entities)
        await database.insert_claim(document_id, ingestion_run_id, claim)
        final_document_status = "completed" if claim.mapping_quality == "complete" else "needs_review"
        await database.set_run_status(
            ingestion_run_id,
            "completed",
            {"entityCount": len(entities), "mappingQuality": claim.mapping_quality},
        )
        await database.set_document_status(document_id, final_document_status)
    except Exception as error:
        await database.set_run_status(
            ingestion_run_id,
            "failed",
            {"errorType": type(error).__name__, "message": str(error)[:500]},
        )
        await database.set_document_status(document_id, "failed")


async def dead_letter(redis: Redis, message_id: str, fields: dict[Any, Any], reason: str) -> None:
    await redis.xadd(
        DEAD_LETTER_STREAM,
        {
            "sourceMessageId": message_id,
            "reason": reason,
            "payload": json.dumps({_decode(key): _decode(value) for key, value in fields.items()}),
        },
    )


async def handle_message(redis: Redis, message_id: str, fields: dict[Any, Any]) -> None:
    payload = parse_stream_payload(fields)
    if payload is None:
        await dead_letter(redis, message_id, fields, "invalid_payload")
        await redis.xack(STREAM_KEY, CONSUMER_GROUP, message_id)
        return

    await process_job(payload)
    await redis.xack(STREAM_KEY, CONSUMER_GROUP, message_id)


def _pending_message_id(entry: Any) -> str:
    if isinstance(entry, dict):
        return str(_decode(entry["message_id"]))
    return str(_decode(entry[0]))


async def reclaim_stale_pending(
    redis: Redis,
    min_idle_ms: int = settings.pending_message_idle_ms,
    count: int = 10,
) -> int:
    pending = await redis.xpending_range(
        STREAM_KEY,
        CONSUMER_GROUP,
        min="-",
        max="+",
        count=count,
        idle=min_idle_ms,
    )
    message_ids = [_pending_message_id(entry) for entry in pending]
    if not message_ids:
        return 0

    claimed = await redis.xclaim(
        STREAM_KEY,
        CONSUMER_GROUP,
        CONSUMER_NAME,
        min_idle_time=min_idle_ms,
        message_ids=message_ids,
    )
    for message_id, fields in claimed:
        await handle_message(redis, str(_decode(message_id)), fields)
    return len(claimed)


async def consume_once(redis: Redis) -> bool:
    response = await redis.xreadgroup(
        CONSUMER_GROUP,
        CONSUMER_NAME,
        {STREAM_KEY: ">"},
        count=1,
        block=5000,
    )
    if not response:
        return False

    for _, messages in response:
        for message_id, fields in messages:
            await handle_message(redis, str(_decode(message_id)), fields)
    return True


async def worker_loop() -> None:
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        await ensure_consumer_group(redis)
        while True:
            consumed = await consume_once(redis)
            if not consumed:
                await reclaim_stale_pending(redis)
    finally:
        await redis.aclose()
