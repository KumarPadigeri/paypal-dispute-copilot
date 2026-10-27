"""Turn an approved reply into PayPal's provide-evidence payload.

Plain code: the tracking data comes from PayPal's tracker records, the notes are
the verified reply. Nothing is sent unless every check here passes.
"""

from copilot.evidence import DisputeCase

NOTES_MAX = 2000  # PayPal's limit for evidence notes

# Tracker carrier names that PayPal's dispute API also accepts as carrier_name.
DISPUTE_CARRIERS = {"UPS", "USPS", "FEDEX", "DHL", "ROYAL_MAIL", "TNT"}


class NotSendable(Exception):
    pass


def check_sendable(case: DisputeCase, reply: str) -> None:
    if case.status != "WAITING_FOR_SELLER_RESPONSE":
        raise NotSendable(f"PayPal is not waiting for the seller (status: {case.status})")
    if "provide_evidence" not in case.actions:
        raise NotSendable("PayPal does not allow providing evidence on this case right now")
    if not reply.strip():
        raise NotSendable("The reply is empty: every sentence was removed as unproven")
    if len(reply) > NOTES_MAX:
        raise NotSendable(f"The reply is {len(reply)} characters; PayPal allows {NOTES_MAX}")


def build_evidences(case: DisputeCase, reply: str) -> list[dict]:
    check_sendable(case, reply)
    if case.shipments:
        tracking = [
            {
                "carrier_name": s["carrier"] if s["carrier"] in DISPUTE_CARRIERS else "OTHER",
                "tracking_number": s["tracking_number"],
            }
            for s in case.shipments
        ]
        return [
            {
                "evidence_type": "PROOF_OF_FULFILLMENT",
                "evidence_info": {"tracking_info": tracking},
                "notes": reply,
            }
        ]
    raise NotSendable("No shipment tracking on file: add tracking before replying")
