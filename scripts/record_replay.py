"""Record a real Writer → Verifier run for a dispute, for the free public replay.

Run: .venv/bin/python -m scripts.record_replay <dispute_id> [--message]
Writes copilot/replays/<dispute_id>.json, or with --message (a message to the buyer)
copilot/replays/messages/<dispute_id>.json (sandbox data only, safe to commit).
"""

import asyncio
import json
import sys
import time
from datetime import UTC, datetime

from copilot.api import real_agents
from copilot.demo import REPLAYS, SAFE_ID
from copilot.evidence import gather_case
from copilot.paypal_client import PayPalClient
from copilot.pipeline import draft_reply, final_payload


async def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--message"]
    kind = "message" if "--message" in sys.argv else "reply"
    if len(args) != 1 or not SAFE_ID.fullmatch(args[0]):
        sys.exit(__doc__)
    dispute_id = args[0]
    case = gather_case(PayPalClient.from_env(), dispute_id)
    write, verify = real_agents(kind)

    start = time.monotonic()
    events: list[dict] = []

    def record(name: str, data: dict) -> None:
        events.append({"t": round(time.monotonic() - start, 2), "name": name, "data": data})
        print(f"{events[-1]['t']:6.2f}s  {name}")

    result = await draft_reply(case, write, verify, on_event=record, closing=kind == "reply")
    record("final", final_payload(result))

    folder = REPLAYS if kind == "reply" else REPLAYS / "messages"
    folder.mkdir(exist_ok=True)
    out = folder / f"{dispute_id}.json"
    recorded = datetime.now(UTC).isoformat(timespec="seconds")
    out.write_text(json.dumps({"recorded": recorded, "events": events}, indent=1) + "\n")
    print(f"Saved {out}")


if __name__ == "__main__":
    asyncio.run(main())
