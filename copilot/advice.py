"""Plain-code advice: when the evidence cannot win, say so instead of drafting.

A reply that argues without proof wastes the seller's time and can read as
misleading. These rules decide from PayPal's data alone; the AI is not asked.
"""

from dataclasses import dataclass

from copilot.evidence import DisputeCase


@dataclass(frozen=True)
class Advice:
    title: str
    text: str
    blocks_draft: bool  # True: drafting would only produce an unsupported argument


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
        )
    return None
