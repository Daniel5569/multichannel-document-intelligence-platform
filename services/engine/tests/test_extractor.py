import pytest

from document_engine.extractor import extract_entities, normalize_amount


def test_extract_entities_from_claim_packet() -> None:
    text = "\n".join(
        [
            "Claim Number: CLM-2026-1042",
            "Policy Number: POL-88A",
            "Claimant: Ada Morgan",
            "Loss Date: 2026-05-17",
            "Claim Amount: $12,840.50",
        ]
    )

    entities = extract_entities(text)
    by_type = {entity.entity_type: entity for entity in entities}

    assert by_type["claim_number"].normalized_value == "CLM-2026-1042"
    assert by_type["policy_number"].normalized_value == "POL-88A"
    assert by_type["claimant_name"].normalized_value == "Ada Morgan"
    assert by_type["loss_date"].normalized_value == "2026-05-17"
    assert by_type["claim_amount"].normalized_value == "1284050"


def test_extract_entities_returns_partial_evidence_when_fields_are_missing() -> None:
    entities = extract_entities("Claim Number: CLM-1")

    assert [entity.entity_type for entity in entities] == ["claim_number"]


def test_normalize_amount_rejects_invalid_money() -> None:
    with pytest.raises(ValueError, match="invalid_claim_amount"):
        normalize_amount("not-money")
