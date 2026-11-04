"""PayPal sandbox client: reads go through PayPal's Agent Toolkit; actions use REST directly.

The toolkit covers listing and reading disputes and reading shipment tracking. Sending evidence,
messaging the buyer, making an offer, accepting a claim (with REFUND) and adding tracking with a
ship date are not in it, or not in the shape we need, so those stay as plain REST calls below.
"""

import json
import time

import httpx
import requests
from paypal_agent_toolkit.shared.configuration import Context
from paypal_agent_toolkit.shared.disputes.tool_handlers import get_dispute, list_disputes
from paypal_agent_toolkit.shared.paypal_client import PayPalClient as ToolkitClient
from paypal_agent_toolkit.shared.tracking.tool_handlers import get_shipment_tracking
from pydantic import ValidationError

from copilot.settings import setting

SANDBOX_URL = "https://api-m.sandbox.paypal.com"


class _Toolkit(ToolkitClient):
    """The toolkit's client, sandbox only, reusing one token instead of fetching one per call."""

    def __init__(self, client_id: str, secret: str):
        super().__init__(client_id, secret, Context(sandbox=True, source="DISPUTE-COPILOT"))
        self._token: str | None = None

    def get_access_token(self) -> str:
        if self._token is None:
            self._token = super().get_access_token()
        return self._token


class PayPalClient:
    def __init__(self, client_id: str, secret: str, base_url: str = SANDBOX_URL):
        if "sandbox" not in base_url:
            raise ValueError("Only the PayPal sandbox is allowed")
        self._auth = (client_id, secret)
        self._base_url = base_url
        self._http = httpx.Client(base_url=base_url, timeout=30)
        self._token: str | None = None
        self._toolkit = _Toolkit(client_id, secret)

    def _read(self, handler, params: dict) -> dict:
        """One toolkit read. A bad or unknown id is LookupError; a sandbox 503 gets one retry."""
        for attempt in range(2):
            try:
                return json.loads(handler(self._toolkit, params))
            except ValidationError as e:
                raise LookupError("Not a PayPal id") from e
            except requests.HTTPError as e:
                status = e.response.status_code if e.response is not None else 0
                if status == 404:
                    raise LookupError("Not found in PayPal") from e
                if status < 500 or attempt == 1:
                    raise
                time.sleep(0.5)
        raise AssertionError("unreachable")

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

    def list_disputes(self) -> list[dict]:
        return self._read(list_disputes, {"page_size": 50}).get("items", [])

    def get_dispute(self, dispute_id: str) -> dict:
        return self._read(get_dispute, {"dispute_id": dispute_id})

    def provide_evidence(self, dispute_id: str, evidences: list[dict]) -> dict:
        resp = self._http.post(
            f"/v1/customer/disputes/{dispute_id}/provide-evidence",
            headers=self._headers(),
            files={"input": (None, json.dumps({"evidences": evidences}), "application/json")},
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"PayPal refused the evidence ({resp.status_code}): {resp.text}")
        return resp.json()

    def send_message(self, dispute_id: str, message: str) -> dict:
        """A message to the buyer, shown in the case (it changes nothing else)."""
        resp = self._http.post(
            f"/v1/customer/disputes/{dispute_id}/send-message",
            headers=self._headers(),
            files={"input": (None, json.dumps({"message": message}), "application/json")},
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"PayPal refused the message ({resp.status_code}): {resp.text}")
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

    def make_offer(
        self,
        dispute_id: str,
        note: str,
        offer_type: str,
        amount: dict,
        return_address: dict | None = None,
    ) -> dict:
        """Offer the buyer a resolution; PayPal refunds if they accept."""
        body = {"note": note, "offer_type": offer_type, "offer_amount": amount}
        if return_address:
            body["return_shipping_address"] = return_address
        resp = self._http.post(
            f"/v1/customer/disputes/{dispute_id}/make-offer", headers=self._headers(), json=body
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"PayPal refused the offer ({resp.status_code}): {resp.text}")
        return resp.json()

    def list_trackers(self, transaction_id: str) -> list[dict]:
        found = self._read(get_shipment_tracking, {"transaction_id": transaction_id})
        return found.get("trackers", [])

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
