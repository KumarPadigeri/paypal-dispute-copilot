"""Web API for the Dispute Copilot UI.

Run: .venv/bin/uvicorn copilot.api:app --reload
"""

from dataclasses import asdict

from fastapi import FastAPI, HTTPException, Request
from httpx import HTTPStatusError

from copilot.evidence import REASONS, gather_case
from copilot.paypal_client import PayPalClient
from copilot.writer import split_claims


def create_app(paypal=None) -> FastAPI:
    """`paypal` is injectable so tests can use a fake; by default it is built from .env."""
    app = FastAPI(title="Dispute Copilot")
    app.state.paypal = paypal

    def pp(request: Request):
        if request.app.state.paypal is None:
            request.app.state.paypal = PayPalClient.from_env()
        return request.app.state.paypal

    @app.get("/api/disputes")
    def list_disputes(request: Request) -> list[dict]:
        return [
            {
                "id": d["dispute_id"],
                "status": d["status"],
                "reason": REASONS.get(d["reason"], d["reason"]),
                "amount": d.get("dispute_amount"),
                "created": d.get("create_time"),
            }
            for d in pp(request).list_disputes()
        ]

    @app.get("/api/disputes/{dispute_id}")
    def get_case(dispute_id: str, request: Request) -> dict:
        try:
            case = gather_case(pp(request), dispute_id)
        except HTTPStatusError as e:
            if e.response.status_code == 404:
                raise HTTPException(404, "Dispute not found") from e
            raise
        return {
            **asdict(case),
            "claims": [{"id": f"C{i}", "text": c} for i, c in enumerate(split_claims(case), 1)],
        }

    return app


app = create_app()
