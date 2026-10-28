import json
from dataclasses import replace
from pathlib import Path

from fastapi.testclient import TestClient

from copilot.advice import advise
from copilot.api import create_app
from copilot.demo import DemoGate
from copilot.evidence import build_case

FIXTURES = Path(__file__).parent / "fixtures"
DISPUTE = json.loads((FIXTURES / "dispute_not_received.json").read_text())
TRACKERS = json.loads((FIXTURES / "trackers.json").read_text())


def test_not_received_without_tracking_advises_instead_of_arguing():
    a = advise(build_case(DISPUTE, []))
    assert a is not None and a.blocks_draft
    assert a.title == "No proof of shipping on file"
    assert "refund" in a.text


def test_no_advice_when_tracking_exists_or_reason_differs():
    assert advise(build_case(DISPUTE, TRACKERS)) is None
    other = replace(build_case(DISPUTE, []), reason="Duplicate payment")
    assert advise(other) is None


def test_not_as_described_without_proof_suggests_return_then_refund():
    nad = replace(build_case(DISPUTE, []), reason="Item not as described")
    a = advise(nad)
    assert a.title == "No proof of what was shipped" and a.blocks_draft
    assert a.resolutions == ("refund_after_return", "refund")


def test_only_resolutions_paypal_allows_now_are_offered():
    from copilot.advice import available

    a = advise(replace(build_case(DISPUTE, []), reason="Item not as described"))
    assert [r.key for r in available(a, ["accept_claim"])] == ["refund"]
    assert [r.key for r in available(a, ["make_offer", "accept_claim"])] == [
        "refund_after_return",
        "refund",
    ]
    assert available(a, []) == []


class NoTrackingPayPal:
    def __init__(self):
        self.calls = []

    def accept_claim(self, dispute_id, note):
        self.calls.append(("accept_claim", dispute_id, note))
        return {}

    def make_offer(self, dispute_id, note, offer_type, amount):
        self.calls.append(("make_offer", dispute_id, offer_type, amount["value"]))
        return {}

    def list_disputes(self):
        return [DISPUTE]

    def get_dispute(self, dispute_id):
        return DISPUTE

    def list_trackers(self, txn):
        return []


def test_api_shows_advice_and_refuses_to_draft_without_calling_ai():
    calls = {"agents": 0}

    def agents():
        calls["agents"] += 1
        raise AssertionError("the AI must not be called")

    gate = DemoGate(None, 30)
    c = TestClient(create_app(NoTrackingPayPal(), agents=agents, gate=gate))
    case = c.get("/api/disputes/PP-R-FOD-10194708").json()
    assert case["advice"]["title"] == "No proof of shipping on file"
    text = c.get("/api/disputes/PP-R-FOD-10194708/draft").text
    assert text.startswith("event: error") and "No proof of shipping" in text
    assert calls["agents"] == 0
    assert gate.live_left() == 30  # nothing counted against the daily cap


def test_refund_needs_pin_and_sends_the_fixed_note():
    from copilot.advice import RESOLUTIONS

    pp = NoTrackingPayPal()
    c = TestClient(create_app(pp, gate=DemoGate("2468", 30)))
    url = "/api/disputes/PP-R-FOD-10194708/resolve"
    assert c.post(url, json={"action": "refund"}).status_code == 403
    assert pp.calls == []
    ok = c.post(url, json={"action": "refund"}, headers={"X-Demo-Pin": "2468"})
    assert ok.status_code == 200 and ok.json()["done"] == "refund"
    assert pp.calls == [("accept_claim", "PP-R-FOD-10194708", RESOLUTIONS["refund"].note)]


def test_resolutions_not_advised_or_not_allowed_are_refused():
    pp = NoTrackingPayPal()
    c = TestClient(create_app(pp, gate=DemoGate(None, 30)))
    url = "/api/disputes/PP-R-FOD-10194708/resolve"
    # Item not received: only "refund" is advised, so a return offer is refused.
    assert c.post(url, json={"action": "refund_after_return"}).status_code == 409
    assert c.post(url, json={"action": "anything"}).status_code == 409
    assert pp.calls == []


def test_case_lists_only_resolutions_paypal_allows_now():
    c = TestClient(create_app(NoTrackingPayPal(), gate=DemoGate(None, 30)))
    advice = c.get("/api/disputes/PP-R-FOD-10194708").json()["advice"]
    # the fixture's dispute allows accept_claim and make_offer
    assert [r["key"] for r in advice["resolutions"]] == ["refund"]
    assert advice["resolutions"][0]["label"] == "Refund the buyer now"
