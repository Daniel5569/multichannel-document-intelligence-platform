from document_engine.extractor import ExtractedEntity
from document_engine.mapper import map_claim


def entity(entity_type: str, value: str, confidence: float = 0.94) -> ExtractedEntity:
    return ExtractedEntity(
        entity_type, value, value, confidence, {"source": "test", "start": 0, "end": len(value)}
    )


def test_map_claim_returns_complete_quality_for_required_fields() -> None:
    claim = map_claim(
        [
            entity("claim_number", "CLM-1"),
            entity("policy_number", "POL-1"),
            entity("claimant_name", "Ada Morgan"),
            entity("loss_date", "2026-05-17"),
            entity("claim_amount", "50000"),
        ]
    )

    assert claim.mapping_quality == "complete"
    assert claim.claim_amount_cents == 50000
    assert claim.currency_code == "USD"


def test_map_claim_marks_partial_quality_for_small_missing_set() -> None:
    claim = map_claim(
        [entity("claim_number", "CLM-1"), entity("policy_number", "POL-1"), entity("claim_amount", "1")]
    )

    assert claim.mapping_quality == "partial"


def test_map_claim_marks_needs_review_for_sparse_evidence() -> None:
    claim = map_claim([entity("claim_number", "CLM-1")])

    assert claim.mapping_quality == "needs_review"
