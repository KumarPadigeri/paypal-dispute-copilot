"""Demo setup: attach a (made-up) shipment tracking number to a sandbox payment,
the way a seller does after shipping. Sandbox only.

Run: .venv/bin/python -m scripts.add_tracking <seller_transaction_id> <tracking_number> \
         [carrier=USPS] [shipment_date=YYYY-MM-DD]
"""

import sys
from datetime import date

from copilot.paypal_client import PayPalClient


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    txn, number = sys.argv[1], sys.argv[2]
    carrier = sys.argv[3] if len(sys.argv) > 3 else "USPS"
    shipped = sys.argv[4] if len(sys.argv) > 4 else date.today().isoformat()

    pp = PayPalClient.from_env()
    pp.add_tracking(txn, number, carrier, shipped)
    for t in pp.list_trackers(txn):
        print(
            f"{t['carrier']}  {t['tracking_number']}  {t['status']}  shipped {t['shipment_date']}"
        )


if __name__ == "__main__":
    main()
