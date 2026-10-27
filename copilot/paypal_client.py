"""Small PayPal REST client for the sandbox. Only reads for now."""

import os

import httpx
from dotenv import load_dotenv

SANDBOX_URL = "https://api-m.sandbox.paypal.com"


class PayPalClient:
    def __init__(self, client_id: str, secret: str, base_url: str = SANDBOX_URL):
        if "sandbox" not in base_url:
            raise ValueError("Only the PayPal sandbox is allowed")
        self._auth = (client_id, secret)
        self._base_url = base_url
        self._http = httpx.Client(base_url=base_url, timeout=30)
        self._token: str | None = None

    @classmethod
    def from_env(cls) -> "PayPalClient":
        load_dotenv()
        client_id = os.getenv("PAYPAL_CLIENT_ID")
        secret = os.getenv("PAYPAL_CLIENT_SECRET")
        if not client_id or not secret:
            raise RuntimeError("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET in .env")
        return cls(client_id, secret, os.getenv("PAYPAL_BASE_URL", SANDBOX_URL))

    def _headers(self) -> dict[str, str]:
        if self._token is None:
            resp = self._http.post(
                "/v1/oauth2/token",
                auth=self._auth,
                data={"grant_type": "client_credentials"},
            )
            resp.raise_for_status()
            self._token = resp.json()["access_token"]
        return {"Authorization": f"Bearer {self._token}"}

    def list_disputes(self) -> list[dict]:
        resp = self._http.get("/v1/customer/disputes", headers=self._headers())
        resp.raise_for_status()
        return resp.json().get("items", [])

    def get_dispute(self, dispute_id: str) -> dict:
        resp = self._http.get(f"/v1/customer/disputes/{dispute_id}", headers=self._headers())
        resp.raise_for_status()
        return resp.json()
