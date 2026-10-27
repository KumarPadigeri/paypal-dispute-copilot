"""Spike step 1: prove our code can talk to the PayPal sandbox.

1. Swap the app's client id + secret for an access token (OAuth).
2. Use the token to list disputes on the sandbox seller account.

Run: .venv/bin/python spike/paypal_hello.py
"""

import os
import sys

import httpx
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.getenv("PAYPAL_BASE_URL", "https://api-m.sandbox.paypal.com")


def get_access_token(client: httpx.Client) -> str:
    client_id = os.getenv("PAYPAL_CLIENT_ID")
    secret = os.getenv("PAYPAL_CLIENT_SECRET")
    if not client_id or not secret:
        sys.exit("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET in .env")
    if "sandbox" not in BASE_URL:
        sys.exit("Refusing to run: PAYPAL_BASE_URL must be the sandbox")

    resp = client.post(
        f"{BASE_URL}/v1/oauth2/token",
        auth=(client_id, secret),
        data={"grant_type": "client_credentials"},
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def list_disputes(client: httpx.Client, token: str) -> list[dict]:
    resp = client.get(
        f"{BASE_URL}/v1/customer/disputes",
        headers={"Authorization": f"Bearer {token}"},
    )
    resp.raise_for_status()
    return resp.json().get("items", [])


def main() -> None:
    with httpx.Client(timeout=30) as client:
        token = get_access_token(client)
        print("OK: got a sandbox access token")

        disputes = list_disputes(client, token)
        print(f"OK: disputes API answered, {len(disputes)} dispute(s) found")
        for d in disputes:
            amount = d.get("dispute_amount", {})
            print(
                f"  {d['dispute_id']}  {d.get('status')}  {d.get('reason')}  "
                f"{amount.get('value')} {amount.get('currency_code')}"
            )


if __name__ == "__main__":
    main()
