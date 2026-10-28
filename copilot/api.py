"""Web API for the Dispute Copilot UI.

Run: .venv/bin/uvicorn copilot.api:app --reload
(also serves the built web page from web/dist when it exists)
"""

import asyncio
import json
from collections.abc import Callable
from dataclasses import asdict
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from httpx import HTTPStatusError
from pydantic import BaseModel

from copilot.demo import REPLAYS, DemoGate, load_replay, play
from copilot.evidence import REASONS, gather_case
from copilot.paypal_client import PayPalClient
from copilot.pipeline import VerifyFn, WriteFn, draft_reply, final_payload
from copilot.settings import setting
from copilot.submit import NotSendable, build_evidences
from copilot.writer import split_claims

# PayPal's dispute stages in plain words, least to most serious.
STAGES = {
    "INQUIRY": "Inquiry",
    "CHARGEBACK": "Chargeback",
    "PRE_ARBITRATION": "Pre-arbitration",
    "ARBITRATION": "Arbitration",
}


def real_agents() -> tuple[WriteFn, VerifyFn]:
    from copilot.llm import make_client
    from copilot.verifier import make_verifier, verify_draft
    from copilot.writer import make_writer, write_draft

    client = make_client()
    writer, verifier = make_writer(client), make_verifier(client)
    return (lambda c, fb: write_draft(writer, c, fb)), (lambda c, d: verify_draft(verifier, c, d))


def sse(name: str, data: dict) -> str:
    return f"event: {name}\ndata: {json.dumps(data)}\n\n"


class PinCheck(BaseModel):
    pin: str


WEB_DIST = Path(__file__).parent.parent / "web" / "dist"


def gate_from_env() -> DemoGate:
    return DemoGate(setting("DEMO_PIN"), int(setting("DRAFT_DAILY_LIMIT", "30")))


def create_app(
    paypal=None,
    agents: Callable[[], tuple[WriteFn, VerifyFn]] = real_agents,
    gate: DemoGate | None = None,
    replays: Path = REPLAYS,
    replay_speed: float = 1.0,
    web_dir: Path = WEB_DIST,
) -> FastAPI:
    """`paypal`, `agents` and `gate` are injectable so tests use fakes; defaults are real."""
    app = FastAPI(title="Dispute Copilot")
    app.state.paypal = paypal
    app.state.verified = {}  # dispute id → last verified reply text (the only text we send)
    app.state.gate = gate or gate_from_env()

    def pp(request: Request):
        if request.app.state.paypal is None:
            request.app.state.paypal = PayPalClient.from_env()
        return request.app.state.paypal

    def load_case(request: Request, dispute_id: str):
        try:
            return gather_case(pp(request), dispute_id)
        except HTTPStatusError as e:
            if e.response.status_code == 404:
                raise HTTPException(404, "Dispute not found") from e
            raise

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True}

    @app.get("/api/disputes")
    def list_disputes(request: Request) -> list[dict]:
        return [
            {
                "id": d["dispute_id"],
                "status": d["status"],
                "reason": REASONS.get(d["reason"], d["reason"]),
                "amount": d.get("dispute_amount"),
                "created": d.get("create_time"),
                "updated": d.get("update_time"),
                "stage": STAGES.get(d.get("dispute_life_cycle_stage", ""), None),
            }
            for d in pp(request).list_disputes()
        ]

    @app.get("/api/disputes/{dispute_id}")
    def get_case(dispute_id: str, request: Request) -> dict:
        case = load_case(request, dispute_id)
        return {
            **asdict(case),
            "claims": [{"id": f"C{i}", "text": c} for i, c in enumerate(split_claims(case), 1)],
        }

    @app.get("/api/demo")
    def demo(request: Request) -> dict:
        g: DemoGate = request.app.state.gate
        return {"pin_required": g.pin_required, "live_left": g.live_left()}

    @app.post("/api/demo/unlock")
    async def unlock(body: PinCheck, request: Request) -> dict:
        ok = request.app.state.gate.unlocked(body.pin)
        if not ok:
            await asyncio.sleep(1)  # slows down guessing
        return {"ok": ok}

    @app.get("/api/disputes/{dispute_id}/draft")
    async def draft(dispute_id: str, request: Request, pin: str | None = None) -> StreamingResponse:
        """Streams Writer → Verifier → rewrite as server-sent events.

        Live (real AI) with a valid PIN and within today's cap; otherwise a replay of a
        recorded real run, which costs nothing and can never be sent.
        """
        case = load_case(request, dispute_id)
        g: DemoGate = request.app.state.gate
        live = g.unlocked(pin) and g.take_live()
        why = None if live else ("limit" if g.unlocked(pin) else "locked")
        replay = None if live else load_replay(dispute_id, replays)

        async def run_live(queue: asyncio.Queue) -> None:
            try:
                write, verify = agents()
                result = await draft_reply(
                    case, write, verify, on_event=lambda n, d: queue.put_nowait(sse(n, d))
                )
                final = final_payload(result)
                request.app.state.verified[dispute_id] = final["reply"]
                queue.put_nowait(sse("final", final))
            except Exception as e:  # shown in the UI instead of a silent hang
                queue.put_nowait(sse("error", {"message": str(e)}))
            finally:
                queue.put_nowait(None)

        async def stream():
            yield sse("mode", {"live": live, "why": why, "live_left": g.live_left()})
            if not live:
                if replay is None:
                    yield sse("error", {"message": "Live AI needs the demo PIN for this case."})
                    return
                async for name, data in play(replay, replay_speed):
                    yield sse(name, data)
                return
            queue: asyncio.Queue[str | None] = asyncio.Queue()
            task = asyncio.create_task(run_live(queue))
            try:
                while (item := await queue.get()) is not None:
                    yield item
            finally:
                task.cancel()

        return StreamingResponse(stream(), media_type="text/event-stream")

    @app.post("/api/disputes/{dispute_id}/send")
    def send(
        dispute_id: str, request: Request, x_demo_pin: str | None = Header(default=None)
    ) -> dict:
        """The merchant's approval: sends the last VERIFIED reply, never browser-typed text."""
        if not request.app.state.gate.unlocked(x_demo_pin):
            raise HTTPException(403, "Sending needs the demo PIN")
        reply = request.app.state.verified.get(dispute_id)
        if reply is None:
            raise HTTPException(409, "No verified draft for this dispute yet")
        case = load_case(request, dispute_id)
        try:
            evidences = build_evidences(case, reply)
        except NotSendable as e:
            raise HTTPException(409, str(e)) from e
        pp(request).provide_evidence(dispute_id, evidences)
        request.app.state.verified.pop(dispute_id)
        return {"sent": True, "status": pp(request).get_dispute(dispute_id)["status"]}

    # The built web page (npm run build) is served from the same server, after the /api routes.
    if web_dir.is_dir():
        app.mount("/", StaticFiles(directory=web_dir, html=True), name="web")

    return app


app = create_app()
