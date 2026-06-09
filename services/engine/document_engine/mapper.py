from dataclasses import dataclass
from datetime import date

from .extractor import ExtractedEntity


@dataclass(frozen=True)
class CanonicalClaim:
    claim_number: str | None
    policy_number: str | None
    claimant_name: str | None
    loss_date: date | None
    claim_amount_cents: int | None
    currency_code: str
    mapping_quality: str


REQUIRED_FIELDS = {"claim_number", "policy_number", "claimant_name", "loss_date", "claim_amount"}


def map_claim(entities: list[ExtractedEntity]) -> CanonicalClaim:
    by_type = {entity.entity_type: entity.normalized_value for entity in entities}
    missing = REQUIRED_FIELDS - set(by_type)
    low_confidence = [entity for entity in entities if entity.confidence < 0.85]

    if not missing and not low_confidence:
        quality = "complete"
    elif len(missing) <= 2:
        quality = "partial"
    else:
        quality = "needs_review"

    amount = by_type.get("claim_amount")
    loss_date = by_type.get("loss_date")
    return CanonicalClaim(
        claim_number=by_type.get("claim_number"),
        policy_number=by_type.get("policy_number"),
        claimant_name=by_type.get("claimant_name"),
        loss_date=date.fromisoformat(loss_date) if loss_date else None,
        claim_amount_cents=int(amount) if amount else None,
        currency_code="USD",
        mapping_quality=quality,
    )
