import json
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

from copilot.api import create_app

FIXTURES = Path(__file__).parent / "fixtures"
DISPUTE = json.loads((FIXTURES / "dispute_not_received.json").read_text())
TRACKERS = json.loads((FIXTURES / "trackers.json").read_text())


class FakePayPal:
    def list_disputes(self):
        return [DISPUTE]

    def get_dispute(self, dispute_id):
        if dispute_id != DISPUTE["dispute_id"]:
            request = httpx.Request("GET", "https://sandbox.test")
            raise httpx.HTTPStatusError(
                "404", request=request, response=httpx.Response(404, request=request)
            )
        return DISPUTE

    def list_trackers(self, txn):
        return TRACKERS


client = TestClient(create_app(FakePayPal()))


def test_list_disputes_is_short_and_readable():
    [d] = client.get("/api/disputes").json()
    assert d == {
        "id": "PP-R-FOD-10194708",
        "status": "WAITING_FOR_SELLER_RESPONSE",
        "reason": "Item not received",
        "amount": {"currency_code": "USD", "value": "49.99"},
        "created": "2026-10-27T00:29:15.329Z",
    }


def test_case_has_claims_evidence_actions_and_shipments():
    case = client.get("/api/disputes/PP-R-FOD-10194708").json()
    assert case["claims"][1] == {
        "id": "C2",
        "text": "It has not arrived and I have no tracking information.",
    }
    assert [e["id"] for e in case["evidence"]] == ["E1", "E2", "E3", "E4", "E5"]
    assert case["evidence"][3]["source"].startswith("PayPal tracking record")
    assert "provide_evidence" in case["actions"]
    assert case["shipments"][0]["carrier"] == "USPS"


def test_unknown_dispute_is_404():
    assert client.get("/api/disputes/PP-NOPE").status_code == 404
