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
from pydantic import BaseModel

from copilot.advice import advise, available, evidence_check
from copilot.demo import REPLAYS, DemoGate, load_replay, play
from copilot.evidence import REASONS, gather_case
from copilot.paypal_client import PayPalClient
from copilot.pipeline import VerifyFn, WriteFn, draft_reply, final_payload
from copilot.settings import return_address, setting
from copilot.submit import NotSendable, build_evidences, check_message
from copilot.writer import split_claims

# PayPal's dispute stages in plain words, least to most serious.
STAGES = {
    "INQUIRY": "Inquiry",
    "CHARGEBACK": "Chargeback",
    "PRE_ARBITRATION": "Pre-arbitration",
    "ARBITRATION": "Arbitration",
}


def real_agents(kind: str = "reply") -> tuple[WriteFn, VerifyFn]:
    """`kind`: "reply" (to PayPal's reviewer) or "message" (to the buyer)."""
    from copilot.llm import make_client
    from copilot.verifier import make_verifier, verify_draft
    from copilot.writer import make_writer, write_draft

    client = make_client()
    writer, verifier = make_writer(client, kind), make_verifier(client)
    return (lambda c, fb: write_draft(writer, c, fb, kind)), (
        lambda c, d: verify_draft(verifier, c, d)
    )


def sse(name: str, data: dict) -> str:
    return f"event: {name}\ndata: {json.dumps(data)}\n\n"


class PinCheck(BaseModel):
    pin: str


class ResolveRequest(BaseModel):
    action: str  # a key of copilot.advice.RESOLUTIONS


WEB_DIST = Path(__file__).parent.parent / "web" / "dist"


def gate_from_env() -> DemoGate:
    return DemoGate(setting("DEMO_PIN"), int(setting("DRAFT_DAILY_LIMIT", "30")))


def create_app(
    paypal=None,
    agents: Callable[[str], tuple[WriteFn, VerifyFn]] = real_agents,
    gate: DemoGate | None = None,
    replays: Path = REPLAYS,
    replay_speed: float = 1.0,
    web_dir: Path = WEB_DIST,
) -> FastAPI:
    """`paypal`, `agents` and `gate` are injectable so tests use fakes; defaults are real."""
    app = FastAPI(title="Dispute Copilot")
    app.state.paypal = paypal
    # (kind, dispute id) → last verified text: the only text we send
    app.state.verified = {}
    app.state.gate = gate or gate_from_env()

    def pp(request: Request):
        if request.app.state.paypal is None:
            request.app.state.paypal = PayPalClient.from_env()
        return request.app.state.paypal

    def load_case(request: Request, dispute_id: str):
        try:
            return gather_case(pp(request), dispute_id)
        except LookupError as e:
            raise HTTPException(404, "Dispute not found") from e

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True}

    @app.get("/api/reasons")
    def reasons() -> list[str]:
        """PayPal's dispute reasons in plain words, in PayPal's order."""
        return list(REASONS.values())

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
                # PayPal's reply-by date; missing it means PayPal decides for the buyer
                "respond_by": d.get("seller_response_due_date"),
            }
            for d in pp(request).list_disputes()
        ]

    @app.get("/api/disputes/{dispute_id}")
    def get_case(dispute_id: str, request: Request) -> dict:
        case = load_case(request, dispute_id)
        advice = advise(case)
        check = evidence_check(case)
        return {
            **asdict(case),
            "check": asdict(check) if check else None,
            "claims": [{"id": f"C{i}", "text": c} for i, c in enumerate(split_claims(case), 1)],
            "advice": {
                **asdict(advice),
                # only what PayPal allows right now, with the exact note that will be sent
                "resolutions": [asdict(r) for r in available(advice, case.actions)],
            }
            if advice
            else None,
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

    def stream_draft(case, request: Request, pin: str | None, kind: str) -> StreamingResponse:
        """Streams Writer → Verifier → rewrite as server-sent events.

        Live (real AI) with a valid PIN and within today's cap; otherwise a replay of a
        recorded real run, which costs nothing and can never be sent.
        """
        g: DemoGate = request.app.state.gate
        live = g.unlocked(pin) and g.take_live()
        why = None if live else ("limit" if g.unlocked(pin) else "locked")
        folder = replays if kind == "reply" else replays / "messages"
        replay = None if live else load_replay(case.dispute_id, folder)

        async def run_live(queue: asyncio.Queue) -> None:
            try:
                write, verify = agents(kind)
                result = await draft_reply(
                    case,
                    write,
                    verify,
                    on_event=lambda n, d: queue.put_nowait(sse(n, d)),
                    closing=kind == "reply",
                )
                final = final_payload(result)
                request.app.state.verified[kind, case.dispute_id] = final["reply"]
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

    @app.get("/api/disputes/{dispute_id}/draft")
    async def draft(dispute_id: str, request: Request, pin: str | None = None) -> StreamingResponse:
        """The reply to PayPal's reviewer."""
        case = load_case(request, dispute_id)
        advice = advise(case)
        if advice and advice.blocks_draft:
            # Checked before the PIN/cap: no AI call, nothing counted.
            async def refuse():
                yield sse("error", {"message": f"{advice.title}. {advice.text}"})

            return StreamingResponse(refuse(), media_type="text/event-stream")
        return stream_draft(case, request, pin, "reply")

    @app.get("/api/disputes/{dispute_id}/message-draft")
    async def message_draft(
        dispute_id: str, request: Request, pin: str | None = None
    ) -> StreamingResponse:
        """A short, cited message to the buyer, checked by the same Verifier."""
        case = load_case(request, dispute_id)
        advice = advise(case)
        if advice and advice.blocks_draft:
            # The evidence can't help the buyer either; the advised resolution carries its own note.
            async def refuse():
                yield sse("error", {"message": f"{advice.title}. {advice.text}"})

            return StreamingResponse(refuse(), media_type="text/event-stream")
        return stream_draft(case, request, pin, "message")

    @app.post("/api/disputes/{dispute_id}/send")
    def send(
        dispute_id: str, request: Request, x_demo_pin: str | None = Header(default=None)
    ) -> dict:
        """The merchant's approval: sends the last VERIFIED reply, never browser-typed text."""
        if not request.app.state.gate.unlocked(x_demo_pin):
            raise HTTPException(403, "Sending needs the demo PIN")
        reply = request.app.state.verified.get(("reply", dispute_id))
        if reply is None:
            raise HTTPException(409, "No verified draft for this dispute yet")
        case = load_case(request, dispute_id)
        try:
            evidences = build_evidences(case, reply)
        except NotSendable as e:
            raise HTTPException(409, str(e)) from e
        pp(request).provide_evidence(dispute_id, evidences)
        request.app.state.verified.pop(("reply", dispute_id))
        return {"sent": True, "status": pp(request).get_dispute(dispute_id)["status"]}

    @app.post("/api/disputes/{dispute_id}/message")
    def send_message(
        dispute_id: str, request: Request, x_demo_pin: str | None = Header(default=None)
    ) -> dict:
        """The merchant's approval: sends the last VERIFIED message, never browser-typed text."""
        if not request.app.state.gate.unlocked(x_demo_pin):
            raise HTTPException(403, "Sending needs the demo PIN")
        message = request.app.state.verified.get(("message", dispute_id))
        if message is None:
            raise HTTPException(409, "No verified message for this dispute yet")
        try:
            check_message(load_case(request, dispute_id), message)
        except NotSendable as e:
            raise HTTPException(409, str(e)) from e
        try:
            pp(request).send_message(dispute_id, message)
        except RuntimeError as e:  # PayPal said no: show its reason instead of a bare 500
            raise HTTPException(502, str(e)) from e
        request.app.state.verified.pop(("message", dispute_id))
        return {"sent": True, "status": pp(request).get_dispute(dispute_id)["status"]}

    @app.post("/api/disputes/{dispute_id}/resolve")
    def resolve(
        dispute_id: str,
        body: ResolveRequest,
        request: Request,
        x_demo_pin: str | None = Header(default=None),
    ) -> dict:
        """The merchant's approval of an advised resolution (refund now / refund after return).

        Only resolutions the advice suggests AND PayPal allows right now; the note is fixed text.
        """
        if not request.app.state.gate.unlocked(x_demo_pin):
            raise HTTPException(403, "Resolving needs the demo PIN")
        case = load_case(request, dispute_id)
        advice = advise(case)
        allowed = {r.key: r for r in available(advice, case.actions)} if advice else {}
        res = allowed.get(body.action)
        if res is None:
            raise HTTPException(409, "That resolution is not available on this case right now")
        client = pp(request)
        try:
            if res.key == "refund":
                client.accept_claim(dispute_id, res.note)
            else:
                amount = client.get_dispute(dispute_id)["dispute_amount"]
                client.make_offer(
                    dispute_id, res.note, "REFUND_WITH_RETURN", amount, return_address()
                )
        except RuntimeError as e:  # PayPal said no: show its reason instead of a bare 500
            raise HTTPException(502, str(e)) from e
        return {"done": res.key, "status": client.get_dispute(dispute_id)["status"]}

    # The built web page (npm run build) is served from the same server, after the /api routes.
    if web_dir.is_dir():
        app.mount("/", StaticFiles(directory=web_dir, html=True), name="web")

    return app


app = create_app()
