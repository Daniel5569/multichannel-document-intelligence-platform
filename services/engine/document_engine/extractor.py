import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation


@dataclass(frozen=True)
class ExtractedEntity:
    entity_type: str
    raw_value: str
    normalized_value: str | None
    confidence: float
    evidence: dict[str, int | str]


PATTERNS: dict[str, re.Pattern[str]] = {
    "claim_number": re.compile(r"\bClaim\s*(?:Number|No\.?)\s*:\s*([A-Z0-9-]+)", re.IGNORECASE),
    "policy_number": re.compile(r"\bPolicy\s*(?:Number|No\.?)\s*:\s*([A-Z0-9-]+)", re.IGNORECASE),
    "claimant_name": re.compile(r"\bClaimant\s*:\s*([A-Za-z][A-Za-z .'-]{1,100})", re.IGNORECASE),
    "loss_date": re.compile(r"\bLoss\s*Date\s*:\s*(\d{4}-\d{2}-\d{2})", re.IGNORECASE),
    "claim_amount": re.compile(r"\bClaim\s*Amount\s*:\s*\$?\s*([0-9,]+(?:\.[0-9]{2})?)", re.IGNORECASE),
}


def normalize_amount(raw_value: str) -> str:
    try:
        amount = Decimal(raw_value.replace(",", ""))
    except InvalidOperation as exc:
        raise ValueError("invalid_claim_amount") from exc
    return str(int(amount * 100))


def normalize_date(raw_value: str) -> str:
    return date.fromisoformat(raw_value).isoformat()


def extract_entities(text_body: str) -> list[ExtractedEntity]:
    entities: list[ExtractedEntity] = []
    for entity_type, pattern in PATTERNS.items():
        match = pattern.search(text_body)
        if not match:
            continue
        raw_value = match.group(1).strip()
        normalized_value = raw_value
        confidence = 0.94

        if entity_type == "claim_amount":
            normalized_value = normalize_amount(raw_value)
        elif entity_type == "loss_date":
            normalized_value = normalize_date(raw_value)

        entities.append(
            ExtractedEntity(
                entity_type=entity_type,
                raw_value=raw_value,
                normalized_value=normalized_value,
                confidence=confidence,
                evidence={"start": match.start(1), "end": match.end(1), "source": "regex_adapter"},
            )
        )
    return entities
