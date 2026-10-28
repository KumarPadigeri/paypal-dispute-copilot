"""Web API for the Dispute Copilot UI.

Run: .venv/bin/uvicorn copilot.api:app --reload
"""

import asyncio
import json
from collections.abc import Callable
from dataclasses import asdict

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from httpx import HTTPStatusError

from copilot.evidence import REASONS, gather_case
from copilot.paypal_client import PayPalClient
from copilot.pipeline import VerifyFn, WriteFn, draft_reply
from copilot.submit import NotSendable, build_evidences
from copilot.writer import answered_claims, render, split_claims

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


def create_app(
    paypal=None, agents: Callable[[], tuple[WriteFn, VerifyFn]] = real_agents
) -> FastAPI:
    """`paypal` and `agents` are injectable so tests use fakes; defaults are the real ones."""
    app = FastAPI(title="Dispute Copilot")
    app.state.paypal = paypal
    app.state.verified = {}  # dispute id → last verified reply text (the only text we send)

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

    @app.get("/api/disputes/{dispute_id}/draft")
    async def draft(dispute_id: str, request: Request) -> StreamingResponse:
        """Runs Writer → Verifier → rewrite and streams each step as server-sent events."""
        case = load_case(request, dispute_id)
        write, verify = agents()
        queue: asyncio.Queue[str | None] = asyncio.Queue()

        async def run() -> None:
            try:
                result = await draft_reply(
                    case, write, verify, on_event=lambda n, d: queue.put_nowait(sse(n, d))
                )
                reply = render(result.draft)
                request.app.state.verified[dispute_id] = reply
                final = {
                    "sentences": result.draft.model_dump()["sentences"],
                    "removed": [asdict(r) for r in result.removed],
                    "rounds": result.rounds,
                    "answered": sorted(answered_claims(result.draft)),
                    "reply": reply,
                }
                queue.put_nowait(sse("final", final))
            except Exception as e:  # shown in the UI instead of a silent hang
                queue.put_nowait(sse("error", {"message": str(e)}))
            finally:
                queue.put_nowait(None)

        async def stream():
            task = asyncio.create_task(run())
            try:
                while (item := await queue.get()) is not None:
                    yield item
            finally:
                task.cancel()

        return StreamingResponse(stream(), media_type="text/event-stream")

    @app.post("/api/disputes/{dispute_id}/send")
    def send(dispute_id: str, request: Request) -> dict:
        """The merchant's approval: sends the last VERIFIED reply, never browser-typed text."""
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

    return app


app = create_app()
