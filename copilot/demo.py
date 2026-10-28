"""Keeps the public demo free: live AI and sending need a PIN, with a daily cap.

Without the PIN (or past the cap), drafting plays back a recording of a real
run (copilot/replays/<dispute id>.json), so visitors still see how it works.
When no PIN is configured (local development), everything is live.
"""

import asyncio
import hmac
import json
import re
from collections.abc import AsyncIterator, Callable
from datetime import date
from pathlib import Path

REPLAYS = Path(__file__).parent / "replays"
SAFE_ID = re.compile(r"[A-Z0-9-]{1,64}")
MAX_GAP = 3.0  # seconds; long AI pauses are shortened in replays


class DemoGate:
    def __init__(self, pin: str | None, daily_limit: int, today: Callable[[], date] = date.today):
        self.pin = pin or None
        self.daily_limit = daily_limit
        self._today = today
        self._day: date | None = None
        self._used = 0

    @property
    def pin_required(self) -> bool:
        return self.pin is not None

    def unlocked(self, pin: str | None) -> bool:
        if self.pin is None:
            return True
        return pin is not None and hmac.compare_digest(pin.encode(), self.pin.encode())

    def live_left(self) -> int:
        if self._day != self._today():
            return self.daily_limit
        return max(0, self.daily_limit - self._used)

    def take_live(self) -> bool:
        """Counts one live draft; False once today's cap is reached."""
        if self._day != self._today():
            self._day, self._used = self._today(), 0
        if self._used >= self.daily_limit:
            return False
        self._used += 1
        return True


def load_replay(dispute_id: str, folder: Path = REPLAYS) -> list[dict] | None:
    if not SAFE_ID.fullmatch(dispute_id):  # the id comes from the URL: never a path
        return None
    path = folder / f"{dispute_id}.json"
    if not path.is_file():
        return None
    return json.loads(path.read_text())["events"]


async def play(events: list[dict], speed: float = 1.0) -> AsyncIterator[tuple[str, dict]]:
    """Yields recorded (name, data) events with their original pacing (long gaps shortened)."""
    last = 0.0
    for e in events:
        await asyncio.sleep(min(e["t"] - last, MAX_GAP) / speed)
        last = e["t"]
        yield e["name"], e["data"]
