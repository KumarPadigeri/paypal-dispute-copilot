"""Draft and verify a cited reply for a live sandbox dispute.

Run: .venv/bin/python -m copilot.write_reply <dispute_id>
"""

import asyncio
import sys

from copilot.evidence import gather_case
from copilot.llm import make_client
from copilot.paypal_client import PayPalClient
from copilot.pipeline import draft_reply
from copilot.verifier import make_verifier, verify_draft
from copilot.writer import answered_claims, make_writer, render, split_claims, write_draft


async def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    case = gather_case(PayPalClient.from_env(), sys.argv[1])
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
    print(f"\nAs sent:\n{render(result.draft)}")


if __name__ == "__main__":
    asyncio.run(main())
