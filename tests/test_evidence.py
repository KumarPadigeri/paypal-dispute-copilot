import json
from pathlib import Path

from copilot.evidence import build_case, day, gather_case

FIXTURE = Path(__file__).parent / "fixtures" / "dispute_not_received.json"


def load() -> dict:
    return json.loads(FIXTURE.read_text())


def test_case_summary():
    case = build_case(load())
    assert case.dispute_id == "PP-R-FOD-10194708"
    assert case.reason == "Item not received"
    assert case.amount == "49.99 USD"
    assert case.respond_by == "Nov 16, 2026 (UTC)"
    assert case.respond_by_iso == "2026-11-16T00:29:15.329Z"
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


TRACKERS = Path(__file__).parent / "fixtures" / "trackers.json"


def test_tracking_becomes_shipping_evidence():
    ev = build_case(load(), json.loads(TRACKERS.read_text())).evidence
    shipped = [e for e in ev if "shipped" in e.text]
    assert len(shipped) == 1
    assert shipped[0].text == (
        "The item was shipped via USPS on Oct 27, 2026, tracking number "
        "9400111899561234567890 (PayPal tracking status: SHIPPED)."
    )
    assert shipped[0].source.startswith("PayPal tracking record")
    assert [e.id for e in ev] == ["E1", "E2", "E3", "E4", "E5", "E6"]


def test_same_day_comparison_is_computed_by_code():
    ev = build_case(load(), json.loads(TRACKERS.read_text())).evidence
    assert ev[-1].text == (
        "PayPal's records date the shipment and the case opening on the same day, Oct 27, 2026."
    )
    later = json.loads(TRACKERS.read_text())
    later[0]["shipment_date"] = "2026-10-29"
    assert not any("same day" in e.text for e in build_case(load(), later).evidence)


def test_return_shipments_are_not_seller_shipping_evidence():
    trackers = json.loads(TRACKERS.read_text())
    trackers[0]["shipment_direction"] = "RETURN"
    assert not any("shipped" in e.text for e in build_case(load(), trackers).evidence)


class FakePayPal:
    def get_dispute(self, dispute_id):
        return load()

    def list_trackers(self, txn):
        assert txn == "84G53576J4545811V"
        return json.loads(TRACKERS.read_text())


def test_gather_case_fetches_trackers_for_the_seller_transaction():
    case = gather_case(FakePayPal(), "PP-R-FOD-10194708")
    assert any("USPS" in e.text for e in case.evidence)
