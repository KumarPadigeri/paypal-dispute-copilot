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
    other = replace(build_case(DISPUTE, []), reason="Item not as described")
    assert advise(other) is None


class NoTrackingPayPal:
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
