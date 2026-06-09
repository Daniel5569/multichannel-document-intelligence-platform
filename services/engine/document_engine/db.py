import json
from typing import Any

import asyncpg

from .config import settings
from .extractor import ExtractedEntity
from .mapper import CanonicalClaim


class Database:
    def __init__(self) -> None:
        self.pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        self.pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=5)

    async def close(self) -> None:
        if self.pool:
            await self.pool.close()

    async def fetch_version_text(self, version_id: str) -> str:
        assert self.pool is not None
        return await self.pool.fetchval("SELECT text_body FROM document_versions WHERE id = $1", version_id)

    async def set_run_status(
        self, ingestion_run_id: str, status: str, risk: dict[str, Any] | None = None
    ) -> None:
        assert self.pool is not None
        await self.pool.execute(
            """
            UPDATE ingestion_runs
            SET status = $2,
                risk_json = CASE WHEN $3::jsonb IS NULL THEN risk_json ELSE risk_json || $3::jsonb END,
                updated_at = now()
            WHERE id = $1
            """,
            ingestion_run_id,
            status,
            json.dumps(risk) if risk is not None else None,
        )

    async def set_document_status(self, document_id: str, status: str) -> None:
        assert self.pool is not None
        await self.pool.execute(
            "UPDATE documents SET status = $2, updated_at = now() WHERE id = $1",
            document_id,
            status,
        )

    async def insert_entities(self, ingestion_run_id: str, entities: list[ExtractedEntity]) -> None:
        assert self.pool is not None
        for entity in entities:
            await self.pool.execute(
                """
                INSERT INTO extracted_entities
                  (ingestion_run_id, entity_type, raw_value, normalized_value, confidence, evidence_json)
                VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                """,
                ingestion_run_id,
                entity.entity_type,
                entity.raw_value,
                entity.normalized_value,
                entity.confidence,
                json.dumps(entity.evidence),
            )

    async def insert_claim(self, document_id: str, ingestion_run_id: str, claim: CanonicalClaim) -> None:
        assert self.pool is not None
        await self.pool.execute(
            """
            INSERT INTO canonical_claims
              (document_id, ingestion_run_id, claim_number, policy_number, claimant_name,
               loss_date, claim_amount_cents, currency_code, mapping_quality)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            """,
            document_id,
            ingestion_run_id,
            claim.claim_number,
            claim.policy_number,
            claim.claimant_name,
            claim.loss_date,
            claim.claim_amount_cents,
            claim.currency_code,
            claim.mapping_quality,
        )


database = Database()
