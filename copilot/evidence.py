"""Turn PayPal data into numbered evidence items.

Plain code, no AI: every fact the reply may cite is built here from PayPal's
own data. Buyer statements are kept apart as claims; they are what the reply
answers, never proof.
"""

from dataclasses import dataclass, field
from datetime import datetime

# PayPal's dispute reasons (the `dispute_reason` list in the Disputes API spec), in its order.
REASONS = {
    "MERCHANDISE_OR_SERVICE_NOT_RECEIVED": "Item not received",
    "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED": "Item not as described",
    "UNAUTHORISED": "Unauthorized payment",
    "CREDIT_NOT_PROCESSED": "Refund not processed",
    "DUPLICATE_TRANSACTION": "Duplicate payment",
    "INCORRECT_AMOUNT": "Incorrect amount",
    "PAYMENT_BY_OTHER_MEANS": "Paid by other means",
    "CANCELED_RECURRING_BILLING": "Canceled subscription still billed",
    "PROBLEM_WITH_REMITTANCE": "Problem with remittance",
    "OTHER": "Other",
}

PROTECTION = {
    "ITEM_NOT_RECEIVED_ELIGIBLE": "Seller Protection (item not received)",
    "UNAUTHORIZED_PAYMENT_ELIGIBLE": "Seller Protection (unauthorized payment)",
    "EXPANDED_SELLER_PROTECTION": "Expanded Seller Protection",
}


@dataclass(frozen=True)
class Evidence:
    id: str  # "E1", "E2", ... what the Writer cites
    text: str  # one plain-English fact
    source: str  # where it came from, for the merchant to inspect


@dataclass(frozen=True)
class DisputeCase:
    dispute_id: str
    reason: str
    amount: str
    status: str
    respond_by: str | None
    buyer_claims: list[str]
    requested_from_seller: list[str]
    evidence: list[Evidence] = field(default_factory=list)
    # what PayPal allows now, e.g. provide_evidence
    actions: list[str] = field(default_factory=list)
    shipments: list[dict] = field(default_factory=list)  # {"carrier", "tracking_number"}
    respond_by_iso: str | None = None  # PayPal's reply-by date, machine-readable
    # for the stage timeline: INQUIRY, CHARGEBACK, ...; INTERNAL (PayPal) or EXTERNAL (card issuer)
    stage: str | None = None
    channel: str | None = None
    opened_iso: str | None = None
    updated_iso: str | None = None
    protection: str | None = None  # Seller Protection the payment is eligible for, in plain words
    # what the buyer, the seller and PayPal did on the case, oldest first (see conversation())
    conversation: list[dict] = field(default_factory=list)


def money(m: dict) -> str:
    return f"{m['value']} {m['currency_code']}"


def day(iso: str) -> str:
    """'2026-10-27T00:24:24.000Z' -> 'Oct 27, 2026 (UTC)'."""
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return f"{dt:%b} {dt.day}, {dt.year} (UTC)"


def shipment_day(date: str) -> str:
    """'2026-10-27' -> 'Oct 27, 2026'."""
    dt = datetime.fromisoformat(date)
    return f"{dt:%b} {dt.day}, {dt.year}"


def tracker_fact(t: dict) -> tuple[str, str]:
    text = (
        f"The item was shipped via {t['carrier']}"
        + (f" on {shipment_day(t['shipment_date'])}" if t.get("shipment_date") else "")
        + f", tracking number {t['tracking_number']} (PayPal tracking status: {t['status']})."
    )
    return text, f"PayPal tracking record {t['transaction_id']}-{t['tracking_number']}"


def evidence_from_dispute(d: dict, trackers: list[dict] | None = None) -> list[Evidence]:
    facts: list[tuple[str, str]] = []
    src = f"PayPal dispute {d['dispute_id']}"

    for t in d.get("disputed_transactions", []):
        txn_src = f"PayPal transaction {t.get('seller_transaction_id', '?')}"
        facts.append(
            (
                f"Payment of {money(t['gross_amount'])} was made on {day(t['create_time'])}.",
                txn_src,
            )
        )
        for item in t.get("items", []):
            kind = "physical product" if item.get("item_type") == "PRODUCT" else "item"
            facts.append(
                (
                    f"The order contained {item.get('item_quantity', '1')} × "
                    f"{item['item_name']} ({kind}).",
                    txn_src,
                )
            )
        protection = PROTECTION.get(t.get("seller_protection_type", ""))
        if t.get("seller_protection_eligible") and protection:
            facts.append((f"PayPal marks this payment as eligible for {protection}.", txn_src))

    for tr in trackers or []:
        if tr.get("shipment_direction", "FORWARD") == "FORWARD":
            facts.append(tracker_fact(tr))

    facts.append(
        (
            f"The buyer opened the case on {day(d['create_time'])}, "
            f"reason: {REASONS.get(d['reason'], d['reason'])}.",
            src,
        )
    )

    # A comparison computed by code, so the Writer can cite it instead of inferring it.
    opened = d["create_time"][:10]
    for tr in trackers or []:
        forward = tr.get("shipment_direction", "FORWARD") == "FORWARD"
        if forward and tr.get("shipment_date") == opened:
            facts.append(
                (
                    "PayPal's records date the shipment and the case opening on the same day, "
                    f"{shipment_day(opened)}.",
                    f"Compared from PayPal tracking record and {src}",
                )
            )
            break

    return [Evidence(f"E{i}", text, source) for i, (text, source) in enumerate(facts, start=1)]


ASKED_FOR = {
    "PROOF_OF_FULFILLMENT": "proof of shipping",
    "PROOF_OF_REFUND": "proof of refund",
    "PROOF_OF_DELIVERY_SIGNATURE": "a delivery signature",
    "ITEM_DESCRIPTION": "an item description",
}
OFFERS = {"REFUND_WITH_RETURN": "a refund after return", "REFUND": "a refund"}
OUTCOMES = {
    "RESOLVED_BUYER_FAVOUR": "in the buyer's favor",
    "RESOLVED_SELLER_FAVOUR": "in your favor",
}


def _event(who: str, time: str | None, title: str, text: str | None = None, kind="action") -> dict:
    """kind: "message" (a chat line), "action" (an offer, evidence, a refund) or "note" (PayPal)."""
    return {"who": who, "time": time, "title": title, "text": text, "kind": kind}


def conversation(d: dict) -> list[dict]:
    """The case's history from PayPal's own records: who did what, when, oldest first.

    who: "buyer", "you" (the seller) or "paypal". Plain code; nothing here is written by the AI.
    The buyer's opening message is marked `opening` (the page shows it as claims C1, C2, ...).
    """
    events: list[dict] = []
    offers = {o.get("offer_time"): o for o in (d.get("offer") or {}).get("history", [])}
    first_buyer = True
    for m in d.get("messages", []):
        text = (m.get("content") or "").strip()
        if m.get("posted_by") == "BUYER":
            e = _event(
                "buyer",
                m.get("time_posted"),
                "Buyer opened the case" if first_buyer else "Buyer wrote",
                text,
                "message",
            )
            e["opening"] = first_buyer
            first_buyer = False
        else:
            offer = offers.pop(m.get("time_posted"), None)
            kind = OFFERS.get((offer or {}).get("offer_type", ""), "a resolution")
            amount = (offer or {}).get("offer_amount")
            title = (
                f"You offered {kind}" + (f" of {money(amount)}" if amount else "")
                if offer
                else "You messaged the buyer"
            )
            e = _event("you", m.get("time_posted"), title, text, "action" if offer else "message")
        events.append(e)
    for o in offers.values():  # offer events with no message of their own (e.g. the buyer's answer)
        who = "buyer" if o.get("actor") == "BUYER" else "you"
        verb = {"ACCEPTED": "accepted", "DENIED": "declined"}.get(
            o.get("event_type", ""), "updated"
        )
        title = f"Buyer {verb} your offer" if who == "buyer" else f"You {verb} the offer"
        events.append(_event(who, o.get("offer_time"), title))
    for ev in d.get("evidences", []):
        source = ev.get("source")
        if source == "REQUESTED_FROM_SELLER":
            asked = ASKED_FOR.get(ev.get("evidence_type", ""), "evidence")
            events.append(
                _event("paypal", ev.get("date"), f"PayPal asked you for {asked}", kind="note")
            )
        elif source == "SUBMITTED_BY_SELLER":
            action = (ev.get("action_info") or {}).get("action")
            if action == "ACCEPT_CLAIM":
                title = "You accepted the claim and refunded the buyer"
            else:
                tracking = ((ev.get("evidence_info") or {}).get("tracking_info") or [{}])[0]
                title = "You sent evidence to PayPal" + (
                    f": {tracking['carrier_name']} tracking {tracking['tracking_number']}"
                    if tracking.get("tracking_number")
                    else ""
                )
            events.append(
                _event("you", ev.get("date"), title, (ev.get("notes") or "").strip() or None)
            )
    outcome = d.get("dispute_outcome")
    if outcome:
        how = OUTCOMES.get(outcome.get("outcome_code", ""), "")
        refunded = outcome.get("amount_refunded")
        title = "PayPal closed the case" + (f" {how}" if how else "")
        if refunded:
            title += f" ({money(refunded)} refunded)"
        events.append(_event("paypal", d.get("update_time"), title, kind="note"))
    return sorted(events, key=lambda e: e["time"] or "")


def seller_transaction_ids(d: dict) -> list[str]:
    return [
        t["seller_transaction_id"]
        for t in d.get("disputed_transactions", [])
        if t.get("seller_transaction_id")
    ]


def gather_case(pp, dispute_id: str) -> DisputeCase:
    """Fetch the dispute and its shipment trackers from PayPal, then build the case."""
    d = pp.get_dispute(dispute_id)
    trackers = [tr for txn in seller_transaction_ids(d) for tr in pp.list_trackers(txn)]
    return build_case(d, trackers)


def build_case(d: dict, trackers: list[dict] | None = None) -> DisputeCase:
    claims = [
        m["content"].strip()
        for m in d.get("messages", [])
        if m.get("posted_by") == "BUYER" and m.get("content")
    ]
    requested = [
        e["evidence_type"]
        for e in d.get("evidences", [])
        if e.get("source") == "REQUESTED_FROM_SELLER"
    ]
    due = d.get("seller_response_due_date")
    return DisputeCase(
        dispute_id=d["dispute_id"],
        reason=REASONS.get(d["reason"], d["reason"]),
        amount=money(d["dispute_amount"]),
        status=d["status"],
        respond_by=day(due) if due else None,
        respond_by_iso=due,
        stage=d.get("dispute_life_cycle_stage"),
        channel=d.get("dispute_channel"),
        opened_iso=d.get("create_time"),
        updated_iso=d.get("update_time"),
        buyer_claims=claims,
        requested_from_seller=requested,
        evidence=evidence_from_dispute(d, trackers),
        actions=[link["rel"] for link in d.get("links", []) if link.get("rel") != "self"],
        shipments=[
            {
                "carrier": t["carrier"],
                "tracking_number": t["tracking_number"],
                "status": t.get("status"),
            }
            for t in trackers or []
            if t.get("shipment_direction", "FORWARD") == "FORWARD"
        ],
        conversation=conversation(d),
        protection=next(
            (
                PROTECTION[t["seller_protection_type"]]
                for t in d.get("disputed_transactions", [])
                if t.get("seller_protection_eligible")
                and t.get("seller_protection_type") in PROTECTION
            ),
            None,
        ),
    )
