"""Draft and verify a cited reply for a live sandbox dispute; optionally send it.

Run: .venv/bin/python -m copilot.write_reply <dispute_id> [--send]

With --send, the final reply is shown and nothing goes to PayPal unless you type "y".
"""

import asyncio
import sys

from copilot.evidence import gather_case
from copilot.llm import make_client
from copilot.paypal_client import PayPalClient
from copilot.pipeline import draft_reply
from copilot.submit import NotSendable, build_evidences
from copilot.verifier import make_verifier, verify_draft
from copilot.writer import answered_claims, make_writer, render, split_claims, write_draft


async def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--send"]
    send = "--send" in sys.argv
    if len(args) != 1:
        sys.exit(__doc__)
    pp = PayPalClient.from_env()
    case = gather_case(pp, args[0])
    claims = split_claims(case)
    for i, c in enumerate(claims, start=1):
        print(f"C{i}  {c}")
    for e in case.evidence:
        print(f"{e.id}  {e.text}")

    client = make_client()
    writer, verifier = make_writer(client), make_verifier(client)
    result = await draft_reply(
        case,
        write=lambda c, fb: write_draft(writer, c, fb),
        verify=lambda c, d: verify_draft(verifier, c, d),
    )

    for r in result.first_rejections:
        print(f"\nRound 1 rejected: {r.sentence}\n  why: {r.reason}")
    print(f"\nFinal draft (after {result.rounds} round(s)):")
    for s in result.draft.sentences:
        print(f"  {s.text}  cites={s.cites} answers={s.answers}")
    for r in result.removed:
        print(f"\nRemoved: {r.sentence}\n  why: {r.reason}")

    answered = answered_claims(result.draft)
    unanswered = [f"C{i}" for i in range(1, len(claims) + 1) if f"C{i}" not in answered]
    print(f"\nClaims answered: {sorted(answered) or 'none'}; not answered: {unanswered or 'none'}")
    reply = render(result.draft)
    print(f"\nAs sent:\n{reply}")

    if not send:
        return
    try:
        evidences = build_evidences(case, reply)
    except NotSendable as e:
        sys.exit(f"\nNot sent: {e}")
    tracking = ", ".join(f"{s['carrier']} {s['tracking_number']}" for s in case.shipments)
    print(f"\nPayPal will receive: proof of fulfillment ({tracking}) + the reply above as notes.")
    if input("Send this to PayPal? [y/N] ").strip().lower() != "y":
        sys.exit("Not sent.")
    pp.provide_evidence(case.dispute_id, evidences)
    after = pp.get_dispute(case.dispute_id)
    print(f"Sent. PayPal status now: {after['status']}")


if __name__ == "__main__":
    asyncio.run(main())
