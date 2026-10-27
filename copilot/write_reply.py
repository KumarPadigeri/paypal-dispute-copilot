"""Draft a cited reply for a live sandbox dispute.

Run: .venv/bin/python -m copilot.write_reply <dispute_id>
"""

import asyncio
import sys

from copilot.evidence import gather_case
from copilot.llm import make_client
from copilot.paypal_client import PayPalClient
from copilot.writer import check_citations, make_writer, render, write_draft


async def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    case = gather_case(PayPalClient.from_env(), sys.argv[1])
    for e in case.evidence:
        print(f"{e.id}  {e.text}")

    draft = await write_draft(make_writer(make_client()), case)
    print("\nDraft:")
    for s in draft.sentences:
        print(f"  {s.text}  {s.cites}")

    problems = check_citations(draft, case)
    print("\nCitation check:", "OK" if not problems else "")
    for p in problems:
        print(f"  ! {p}")
    print(f"\nAs sent:\n{render(draft)}")


if __name__ == "__main__":
    asyncio.run(main())
