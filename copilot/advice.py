"""Plain-code advice: when the evidence cannot win, say so and offer a fair way out.

A reply that argues without proof wastes the seller's time and can read as
misleading. These rules decide from PayPal's data alone; the AI is not asked.
Resolutions move money, so their notes are fixed text written here, never by the AI.
"""

from dataclasses import dataclass

from copilot.evidence import DisputeCase


@dataclass(frozen=True)
class Resolution:
    key: str  # "refund" | "refund_after_return"
    label: str
    note: str  # sent to PayPal with the action
    needs: str  # the PayPal action that must be allowed right now


RESOLUTIONS = {
    "refund": Resolution(
        key="refund",
        label="Refund the buyer now",
        note="We are sorry about this order. We accept the claim and refund the full amount.",
        needs="accept_claim",
    ),
    "refund_after_return": Resolution(
        key="refund_after_return",
        label="Offer refund after return",
        note=(
            "We are sorry the item did not match what you expected. Please return it and we "
            "will refund the full amount once it arrives."
        ),
        needs="make_offer",
    ),
}


@dataclass(frozen=True)
class Advice:
    title: str
    text: str
    blocks_draft: bool  # True: drafting would only produce an unsupported argument
    resolutions: tuple[str, ...] = ()  # keys of RESOLUTIONS, best first


def advise(case: DisputeCase) -> Advice | None:
    if case.reason == "Item not received" and not case.shipments:
        return Advice(
            title="No proof of shipping on file",
            text=(
                "PayPal has no tracking number for this payment, so a reply cannot prove the "
                "item was sent. If you shipped it, add the tracking number in PayPal and come "
                "back. If you did not, refunding the buyer is usually the fastest, fairest end."
            ),
            blocks_draft=True,
            resolutions=("refund",),
        )
    if case.reason == "Item not as described" and not case.shipments:
        return Advice(
            title="No proof of what was shipped",
            text=(
                "PayPal's records show what was ordered, not what was sent, so a reply cannot "
                "prove the item matched its description. Cases like this usually end with a "
                "return and a refund. If you have photos of the item you shipped, upload them "
                "in PayPal instead."
            ),
            blocks_draft=True,
            resolutions=("refund_after_return", "refund"),
        )
    return None


def available(advice: Advice, actions: list[str]) -> list[Resolution]:
    """The advised resolutions PayPal allows on this case right now."""
    return [RESOLUTIONS[k] for k in advice.resolutions if RESOLUTIONS[k].needs in actions]


# What PayPal asks the seller for (`evidences` REQUESTED_FROM_SELLER), in plain words.
ASKED = {
    "PROOF_OF_FULFILLMENT": "proof of shipping",
    "PROOF_OF_REFUND": "proof of refund",
    "PROOF_OF_DELIVERY_SIGNATURE": "a delivery signature",
    "ITEM_DESCRIPTION": "an item description",
}


@dataclass(frozen=True)
class EvidenceCheck:
    tone: str  # "ok": PayPal's records hold what it asks for; "warn": something is missing
    text: str


def evidence_check(case: DisputeCase) -> EvidenceCheck | None:
    """What PayPal asks for against what its records hold, for a case waiting on the seller.

    Plain code, shown at the top of the case. Cases the advice covers (no proof) get the advice.
    """
    if case.status != "WAITING_FOR_SELLER_RESPONSE" or advise(case):
        return None
    have = {"PROOF_OF_FULFILLMENT"} if case.shipments else set()
    missing = [
        ASKED.get(r, r.lower().replace("_", " "))
        for r in case.requested_from_seller
        if r not in have
    ]
    if missing:
        return EvidenceCheck(
            "warn",
            f"PayPal asks for {' and '.join(missing)}, and its records don't have it yet. "
            "Add it in PayPal before you reply.",
        )
    if not case.shipments:
        return None
    s = case.shipments[0]
    tracking = f"{s['carrier']} tracking {s['tracking_number']}"
    if "PROOF_OF_FULFILLMENT" in case.requested_from_seller:
        text = f"Strong evidence: PayPal asks for proof of shipping, and you have {tracking}."
    else:
        text = f"Strong evidence: you have {tracking}."
    if case.protection:
        text += f" The payment is eligible for {case.protection}."
    if s.get("status") != "DELIVERED":
        text += " Tracking shows it shipped, not yet delivered."
    return EvidenceCheck("ok", text)
