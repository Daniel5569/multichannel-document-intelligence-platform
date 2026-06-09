from typing import Any

import pytest

from document_engine import worker


def test_parse_stream_payload_accepts_valid_payload() -> None:
    payload = worker.parse_stream_payload(
        {
            "payload": (
                '{"ingestionRunId":"run-1","documentId":"doc-1",'
                '"versionId":"version-1","extractionProfile":"claims"}'
            )
        }
    )

    assert payload == {
        "ingestionRunId": "run-1",
        "documentId": "doc-1",
        "versionId": "version-1",
        "extractionProfile": "claims",
    }


def test_parse_stream_payload_rejects_invalid_payloads() -> None:
    assert worker.parse_stream_payload({"payload": "not-json"}) is None
    assert worker.parse_stream_payload({"payload": '["not-object"]'}) is None
    assert worker.parse_stream_payload({"payload": '{"ingestionRunId":"run-1"}'}) is None


class FakeDatabase:
    def __init__(self, text_body: str, should_fail_fetch: bool = False) -> None:
        self.text_body = text_body
        self.should_fail_fetch = should_fail_fetch
        self.run_statuses: list[tuple[str, str, dict[str, Any] | None]] = []
        self.document_statuses: list[tuple[str, str]] = []
        self.entity_count = 0
        self.claim_quality: str | None = None

    async def fetch_version_text(self, version_id: str) -> str:
        assert version_id == "version-1"
        if self.should_fail_fetch:
            raise RuntimeError("version storage unavailable")
        return self.text_body

    async def set_run_status(
        self, ingestion_run_id: str, status: str, risk: dict[str, Any] | None = None
    ) -> None:
        self.run_statuses.append((ingestion_run_id, status, risk))

    async def set_document_status(self, document_id: str, status: str) -> None:
        self.document_statuses.append((document_id, status))

    async def insert_entities(self, ingestion_run_id: str, entities: list[Any]) -> None:
        self.entity_count = len(entities)

    async def insert_claim(self, document_id: str, ingestion_run_id: str, claim: Any) -> None:
        self.claim_quality = claim.mapping_quality


@pytest.mark.asyncio
async def test_process_job_extracts_and_completes_claim(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_db = FakeDatabase(
        "\n".join(
            [
                "Claim Number: CLM-2026-1042",
                "Policy Number: POL-88A",
                "Claimant: Ada Morgan",
                "Loss Date: 2026-05-17",
                "Claim Amount: $500.00",
            ]
        )
    )
    monkeypatch.setattr(worker, "database", fake_db)

    await worker.process_job(
        {
            "ingestionRunId": "run-1",
            "documentId": "doc-1",
            "versionId": "version-1",
            "extractionProfile": "claims",
        }
    )

    assert fake_db.run_statuses[0] == ("run-1", "running", None)
    assert fake_db.run_statuses[-1][1] == "completed"
    assert fake_db.document_statuses[-1] == ("doc-1", "completed")
    assert fake_db.entity_count == 5
    assert fake_db.claim_quality == "complete"


@pytest.mark.asyncio
async def test_process_job_marks_failed_on_extraction_error(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_db = FakeDatabase("Claim Number: CLM-1", should_fail_fetch=True)
    monkeypatch.setattr(worker, "database", fake_db)

    await worker.process_job(
        {
            "ingestionRunId": "run-1",
            "documentId": "doc-1",
            "versionId": "version-1",
            "extractionProfile": "claims",
        }
    )

    assert fake_db.run_statuses[-1][1] == "failed"
    assert fake_db.document_statuses[-1] == ("doc-1", "failed")


class FakeRedisForReclaim:
    def __init__(self) -> None:
        self.acked: list[str] = []
        self.claimed_message_ids: list[str] = []

    async def xpending_range(self, *args: Any, **kwargs: Any) -> list[dict[str, Any]]:
        assert kwargs["idle"] == 60000
        return [{"message_id": "1670000000000-0", "time_since_delivered": 65000}]

    async def xclaim(self, *args: Any, **kwargs: Any) -> list[tuple[str, dict[str, str]]]:
        self.claimed_message_ids = list(kwargs["message_ids"])
        return [
            (
                "1670000000000-0",
                {
                    "payload": (
                        '{"ingestionRunId":"run-1","documentId":"doc-1",'
                        '"versionId":"version-1","extractionProfile":"claims"}'
                    )
                },
            )
        ]

    async def xack(self, stream_key: str, group: str, message_id: str) -> None:
        assert stream_key == worker.STREAM_KEY
        assert group == worker.CONSUMER_GROUP
        self.acked.append(message_id)


@pytest.mark.asyncio
async def test_reclaim_stale_pending_uses_xclaim(monkeypatch: pytest.MonkeyPatch) -> None:
    processed: list[dict[str, str]] = []

    async def fake_process_job(payload: dict[str, str]) -> None:
        processed.append(payload)

    fake_redis = FakeRedisForReclaim()
    monkeypatch.setattr(worker, "process_job", fake_process_job)

    claimed_count = await worker.reclaim_stale_pending(fake_redis)  # type: ignore[arg-type]

    assert claimed_count == 1
    assert fake_redis.claimed_message_ids == ["1670000000000-0"]
    assert fake_redis.acked == ["1670000000000-0"]
    assert processed[0]["ingestionRunId"] == "run-1"
