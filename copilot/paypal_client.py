"""Small PayPal REST client for the sandbox."""

import json

import httpx

from copilot.settings import setting

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
        client_id = setting("PAYPAL_CLIENT_ID")
        secret = setting("PAYPAL_CLIENT_SECRET")
        if not client_id or not secret:
            raise RuntimeError("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET in .env")
        return cls(client_id, secret, setting("PAYPAL_BASE_URL", SANDBOX_URL))

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

    def _get(self, path: str, params: dict | None = None) -> dict:
        # The sandbox sometimes answers 503 once; one retry is enough.
        for attempt in range(2):
            resp = self._http.get(path, params=params, headers=self._headers())
            if resp.status_code < 500 or attempt == 1:
                break
        resp.raise_for_status()
        return resp.json()

    def list_disputes(self) -> list[dict]:
        return self._get("/v1/customer/disputes").get("items", [])

    def get_dispute(self, dispute_id: str) -> dict:
        return self._get(f"/v1/customer/disputes/{dispute_id}")

    def provide_evidence(self, dispute_id: str, evidences: list[dict]) -> dict:
        resp = self._http.post(
            f"/v1/customer/disputes/{dispute_id}/provide-evidence",
            headers=self._headers(),
            files={"input": (None, json.dumps({"evidences": evidences}), "application/json")},
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"PayPal refused the evidence ({resp.status_code}): {resp.text}")
        return resp.json()

    def accept_claim(self, dispute_id: str, note: str) -> dict:
        """Refund in full and close the case in the buyer's favor (PayPal moves the money)."""
        body = {"note": note, "accept_claim_type": "REFUND"}
        resp = self._http.post(
            f"/v1/customer/disputes/{dispute_id}/accept-claim",
            headers=self._headers(),
            files={"input": (None, json.dumps(body), "application/json")},
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"PayPal refused the refund ({resp.status_code}): {resp.text}")
        return resp.json()

    def make_offer(self, dispute_id: str, note: str, offer_type: str, amount: dict) -> dict:
        """Offer the buyer a resolution; PayPal refunds if they accept."""
        body = {"note": note, "offer_type": offer_type, "offer_amount": amount}
        resp = self._http.post(
            f"/v1/customer/disputes/{dispute_id}/make-offer", headers=self._headers(), json=body
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"PayPal refused the offer ({resp.status_code}): {resp.text}")
        return resp.json()

    def list_trackers(self, transaction_id: str) -> list[dict]:
        return self._get("/v1/shipping/trackers", {"transaction_id": transaction_id}).get(
            "trackers", []
        )

    def add_tracking(
        self, transaction_id: str, tracking_number: str, carrier: str, shipment_date: str
    ) -> dict:
        body = {
            "trackers": [
                {
                    "transaction_id": transaction_id,
                    "tracking_number": tracking_number,
                    "status": "SHIPPED",
                    "carrier": carrier,
                    "shipment_date": shipment_date,
                }
            ]
        }
        resp = self._http.post("/v1/shipping/trackers-batch", json=body, headers=self._headers())
        resp.raise_for_status()
        result = resp.json()
        if result.get("errors"):
            raise RuntimeError(f"PayPal rejected the tracker: {result['errors']}")
        return result
