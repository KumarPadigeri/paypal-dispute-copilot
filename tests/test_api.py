import json
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

from copilot.api import create_app
from copilot.verifier import Verdict
from copilot.writer import Draft, Sentence

FIXTURES = Path(__file__).parent / "fixtures"
DISPUTE = json.loads((FIXTURES / "dispute_not_received.json").read_text())
TRACKERS = json.loads((FIXTURES / "trackers.json").read_text())


class FakePayPal:
    def __init__(self):
        self.sent = []

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

    def provide_evidence(self, dispute_id, evidences):
        self.sent.append((dispute_id, evidences))
        return {}


GOOD = Sentence(text="It shipped via USPS on Oct 27, 2026.", cites=["E4"], answers=["C2"])
TOO_FAR = Sentence(text="It shipped before the case was opened.", cites=["E4", "E5"])


def fake_agents():
    calls = {"n": 0}

    async def write(case, feedback):
        calls["n"] += 1
        return Draft(sentences=[GOOD, TOO_FAR] if calls["n"] == 1 else [GOOD])

    async def verify(case, draft):
        return [
            Verdict(sentence=i, supported="before" not in s.text, reason="adds a time order")
            for i, s in enumerate(draft.sentences, start=1)
        ]

    return write, verify


paypal = FakePayPal()
client = TestClient(create_app(paypal, agents=fake_agents))


def events(text: str) -> list[tuple[str, dict]]:
    out = []
    for block in text.strip().split("\n\n"):
        name = block.split("\n")[0].removeprefix("event: ")
        data = json.loads(block.split("\n")[1].removeprefix("data: "))
        out.append((name, data))
    return out


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


def test_draft_streams_each_step_then_the_verified_reply():
    resp = client.get("/api/disputes/PP-R-FOD-10194708/draft")
    assert resp.headers["content-type"].startswith("text/event-stream")
    evs = events(resp.text)
    assert [n for n, _ in evs] == [
        "writing",
        "draft",
        "verifying",
        "verdicts",
        "rewriting",
        "draft",
        "verifying",
        "verdicts",
        "final",
    ]
    round1 = evs[3][1]["verdicts"]
    assert round1[1] == {
        "sentence": TOO_FAR.text,
        "supported": False,
        "reason": "adds a time order",
    }
    final = evs[-1][1]
    assert final["reply"] == GOOD.text
    assert final["answered"] == ["C2"]
    assert final["rounds"] == 2


def test_send_needs_a_verified_draft_first():
    fresh = TestClient(create_app(FakePayPal(), agents=fake_agents))
    resp = fresh.post("/api/disputes/PP-R-FOD-10194708/send")
    assert resp.status_code == 409


def test_send_sends_exactly_the_verified_reply_once():
    paypal.sent.clear()
    client.get("/api/disputes/PP-R-FOD-10194708/draft")
    resp = client.post("/api/disputes/PP-R-FOD-10194708/send")
    assert resp.status_code == 200
    [(dispute_id, [ev])] = paypal.sent
    assert dispute_id == "PP-R-FOD-10194708"
    assert ev["notes"] == GOOD.text
    assert ev["evidence_info"]["tracking_info"][0]["tracking_number"] == "9400111899561234567890"
    # A second click without a new verified draft sends nothing.
    assert client.post("/api/disputes/PP-R-FOD-10194708/send").status_code == 409
