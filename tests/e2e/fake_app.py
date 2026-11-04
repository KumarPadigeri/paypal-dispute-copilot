"""The real app with a fake PayPal made from saved sandbox data: no secrets, no network.

Cases: the $49.99 "not received" case (with tracking, so it can be drafted) and a
copy without tracking (so the app gives advice). Demo PIN 1234 is on, like the live site.
"""

import copy
import json
from pathlib import Path

from copilot.api import create_app
from copilot.demo import DemoGate

FIXTURES = Path(__file__).parent.parent / "fixtures"
WITH_TRACKING = json.loads((FIXTURES / "dispute_not_received.json").read_text())
TRACKERS = json.loads((FIXTURES / "trackers.json").read_text())

NO_TRACKING = copy.deepcopy(WITH_TRACKING)
NO_TRACKING["dispute_id"] = "PP-R-TEST-00000002"
NO_TRACKING["disputed_transactions"][0]["seller_transaction_id"] = "NOTRACKING000002"
NO_TRACKING["dispute_amount"]["value"] = "35.00"

PIN = "1234"


class FixturePayPal:
    def list_disputes(self):
        return [WITH_TRACKING, NO_TRACKING]

    def get_dispute(self, dispute_id):
        return {d["dispute_id"]: d for d in self.list_disputes()}[dispute_id]

    def list_trackers(self, transaction_id):
        return TRACKERS if transaction_id == "84G53576J4545811V" else []

    def provide_evidence(self, *args):
        raise AssertionError("browser tests must never send")

    accept_claim = make_offer = send_message = provide_evidence


def no_ai(kind):
    raise AssertionError("browser tests must never call the AI")


def make(web_dir: Path):
    return create_app(
        FixturePayPal(), agents=no_ai, gate=DemoGate(PIN, 30), replay_speed=20, web_dir=web_dir
    )
