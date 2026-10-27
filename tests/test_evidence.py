import json
from pathlib import Path

from copilot.evidence import build_case, day

FIXTURE = Path(__file__).parent / "fixtures" / "dispute_not_received.json"


def load() -> dict:
    return json.loads(FIXTURE.read_text())


def test_case_summary():
    case = build_case(load())
    assert case.dispute_id == "PP-R-FOD-10194708"
    assert case.reason == "Item not received"
    assert case.amount == "49.99 USD"
    assert case.respond_by == "Nov 16, 2026 (UTC)"
    assert case.requested_from_seller == ["PROOF_OF_FULFILLMENT"]


def test_evidence_is_numbered_facts_from_paypal():
    ev = build_case(load()).evidence
    assert [e.id for e in ev] == ["E1", "E2", "E3", "E4"]
    assert ev[0].text == "Payment of 49.99 USD was made on Oct 27, 2026 (UTC)."
    assert ev[1].text == "The order contained 1 × Ceramic Pour-Over Coffee Set (physical product)."
    assert "Expanded Seller Protection" in ev[2].text
    assert "Item not received" in ev[3].text
    assert all(e.source.startswith("PayPal ") for e in ev)


def test_buyer_claims_are_kept_out_of_evidence():
    case = build_case(load())
    assert len(case.buyer_claims) == 1
    assert "has not arrived" in case.buyer_claims[0]
    assert not any("has not arrived" in e.text for e in case.evidence)


def test_no_protection_fact_when_not_eligible():
    d = load()
    d["disputed_transactions"][0]["seller_protection_eligible"] = False
    texts = [e.text for e in build_case(d).evidence]
    assert not any("Seller Protection" in t for t in texts)


def test_day_formats_utc_dates():
    assert day("2026-11-16T00:29:15.329Z") == "Nov 16, 2026 (UTC)"
