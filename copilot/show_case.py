"""Print a live sandbox dispute as a case with numbered evidence.

Run: .venv/bin/python -m copilot.show_case            (lists disputes)
     .venv/bin/python -m copilot.show_case <dispute_id>
"""

import sys

from copilot.evidence import gather_case
from copilot.paypal_client import PayPalClient


def main() -> None:
    pp = PayPalClient.from_env()
    if len(sys.argv) < 2:
        for d in pp.list_disputes():
            print(f"{d['dispute_id']}  {d['status']}  {d['reason']}")
        return

    case = gather_case(pp, sys.argv[1])
    print(f"{case.dispute_id}: {case.reason}, {case.amount}, {case.status}")
    print(f"Respond by: {case.respond_by}")
    print(f"PayPal asks the seller for: {', '.join(case.requested_from_seller) or 'nothing yet'}")
    print("\nBuyer says:")
    for c in case.buyer_claims:
        print(f'  "{c}"')
    print("\nEvidence:")
    for e in case.evidence:
        print(f"  {e.id}  {e.text}   [{e.source}]")


if __name__ == "__main__":
    main()
