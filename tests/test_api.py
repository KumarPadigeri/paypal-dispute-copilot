import json
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

from copilot.api import create_app
from copilot.demo import DemoGate
from copilot.verifier import Verdict
from copilot.writer import CLOSING, Draft, Sentence

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
client = TestClient(create_app(paypal, agents=fake_agents, gate=DemoGate(None, 30)))


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
        "updated": "2026-10-27T00:32:43.893Z",
        "stage": "Inquiry",
    }


def test_case_has_claims_evidence_actions_and_shipments():
    case = client.get("/api/disputes/PP-R-FOD-10194708").json()
    assert case["claims"][1] == {
        "id": "C2",
        "text": "It has not arrived and I have no tracking information.",
    }
    assert [e["id"] for e in case["evidence"]] == ["E1", "E2", "E3", "E4", "E5", "E6"]
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
        "mode",
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
    round1 = evs[4][1]["verdicts"]
    assert round1[1] == {
        "sentence": TOO_FAR.text,
        "supported": False,
        "reason": "adds a time order",
    }
    final = evs[-1][1]
    assert final["reply"] == f"{GOOD.text} {CLOSING}"
    assert final["answered"] == ["C2"]
    assert final["rounds"] == 2


def test_send_needs_a_verified_draft_first():
    fresh = TestClient(create_app(FakePayPal(), agents=fake_agents, gate=DemoGate(None, 30)))
    resp = fresh.post("/api/disputes/PP-R-FOD-10194708/send")
    assert resp.status_code == 409


def test_send_sends_exactly_the_verified_reply_once():
    paypal.sent.clear()
    client.get("/api/disputes/PP-R-FOD-10194708/draft")
    resp = client.post("/api/disputes/PP-R-FOD-10194708/send")
    assert resp.status_code == 200
    [(dispute_id, [ev])] = paypal.sent
    assert dispute_id == "PP-R-FOD-10194708"
    assert ev["notes"] == f"{GOOD.text} {CLOSING}"
    assert ev["evidence_info"]["tracking_info"][0]["tracking_number"] == "9400111899561234567890"
    # A second click without a new verified draft sends nothing.
    assert client.post("/api/disputes/PP-R-FOD-10194708/send").status_code == 409


# --- Public demo: PIN, daily cap, replay -------------------------------------------------

REPLAY = {
    "events": [
        {"t": 0.0, "name": "writing", "data": {"round": 1}},
        {
            "t": 0.5,
            "name": "final",
            "data": {
                "sentences": [],
                "removed": [],
                "rounds": 1,
                "answered": [],
                "reply": "Recorded reply.",
            },
        },
    ]
}


def demo_client(tmp_path, pin="2468", limit=30, with_replay=True):
    if with_replay:
        (tmp_path / "PP-R-FOD-10194708.json").write_text(json.dumps(REPLAY))
    calls = {"agents": 0}

    def counting_agents():
        calls["agents"] += 1
        return fake_agents()

    app = create_app(
        FakePayPal(),
        agents=counting_agents,
        gate=DemoGate(pin, limit),
        replays=tmp_path,
        replay_speed=1000,
    )
    return TestClient(app), calls


def test_without_pin_draft_is_a_free_replay_and_cannot_be_sent(tmp_path):
    c, calls = demo_client(tmp_path)
    evs = events(c.get("/api/disputes/PP-R-FOD-10194708/draft").text)
    assert evs[0] == ("mode", {"live": False, "why": "locked", "live_left": 30})
    assert evs[-1][1]["reply"] == "Recorded reply."
    assert calls["agents"] == 0  # no AI was called
    assert c.post("/api/disputes/PP-R-FOD-10194708/send").status_code == 403
    pinned = c.post("/api/disputes/PP-R-FOD-10194708/send", headers={"X-Demo-Pin": "2468"})
    assert pinned.status_code == 409  # a replay never becomes a sendable draft


def test_with_pin_draft_is_live_and_counts_toward_the_daily_cap(tmp_path):
    c, calls = demo_client(tmp_path, limit=1)
    first = events(c.get("/api/disputes/PP-R-FOD-10194708/draft?pin=2468").text)
    assert first[0][1]["live"] is True
    assert calls["agents"] == 1
    second = events(c.get("/api/disputes/PP-R-FOD-10194708/draft?pin=2468").text)
    assert second[0][1] == {"live": False, "why": "limit", "live_left": 0}
    assert calls["agents"] == 1  # cap reached: replay, no extra AI call


def test_locked_case_without_a_recording_explains_instead_of_calling_ai(tmp_path):
    c, calls = demo_client(tmp_path, with_replay=False)
    evs = events(c.get("/api/disputes/PP-R-FOD-10194708/draft").text)
    assert evs[-1][0] == "error" and "demo PIN" in evs[-1][1]["message"]
    assert calls["agents"] == 0


def test_unlock_checks_the_pin(tmp_path):
    c, _ = demo_client(tmp_path)
    assert c.get("/api/demo").json() == {"pin_required": True, "live_left": 30}
    assert c.post("/api/demo/unlock", json={"pin": "2468"}).json() == {"ok": True}
    assert c.post("/api/demo/unlock", json={"pin": "0000"}).json() == {"ok": False}


def test_daily_cap_resets_the_next_day():
    from datetime import date

    day = {"d": date(2026, 11, 1)}
    g = DemoGate("2468", 2, today=lambda: day["d"])
    assert [g.take_live(), g.take_live(), g.take_live()] == [True, True, False]
    day["d"] = date(2026, 11, 2)
    assert g.live_left() == 2 and g.take_live() is True


def test_replay_names_cannot_escape_the_replay_folder(tmp_path):
    from copilot.demo import load_replay

    (tmp_path / "secret.json").write_text(json.dumps(REPLAY))
    assert load_replay("../secret", tmp_path / "replays") is None
    assert load_replay("secret", tmp_path) is None  # lower case is not a case id either


def test_health_and_built_web_page_are_served(tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><title>Dispute Copilot</title>")
    c = TestClient(create_app(FakePayPal(), gate=DemoGate(None, 30), web_dir=tmp_path))
    assert c.get("/api/health").json() == {"ok": True}
    assert "Dispute Copilot" in c.get("/").text
    assert c.get("/api/disputes").status_code == 200  # API routes still win over the page


def test_reasons_are_paypals_full_list_in_order():
    reasons = client.get("/api/reasons").json()
    assert len(reasons) == 10
    assert reasons[:2] == ["Item not received", "Item not as described"]
    assert "Problem with remittance" in reasons and reasons[-1] == "Other"
