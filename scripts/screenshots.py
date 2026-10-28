"""Screenshot the UI at the widths we check: 1920, 1600, 1366 (desktop) and 375 (phone).

Uses the installed Google Chrome through Playwright. Needs the API and Vite running.

Run: .venv/bin/python -m scripts.screenshots <out_dir> [path=/] [name=page] [--draft]

--draft clicks "Draft reply", waits for the verified reply and points at its first
sentence (runs the real agents once per size; never clicks send).
"""

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

SIZES = [(1920, 1080), (1600, 900), (1366, 768), (375, 812)]
BASE = "http://localhost:5173"


def main() -> None:
    draft = "--draft" in sys.argv
    args = [a for a in sys.argv[1:] if a != "--draft"]
    if not args:
        sys.exit(__doc__)
    out = Path(args[0])
    path = args[1] if len(args) > 1 else "/"
    name = args[2] if len(args) > 2 else "page"
    out.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        for w, h in SIZES:
            phone = w < 600
            page = browser.new_page(
                viewport={"width": w, "height": h},
                device_scale_factor=2 if phone else 1,
                is_mobile=phone,
                has_touch=phone,
            )
            page.goto(BASE + path, wait_until="networkidle")
            if draft:
                page.get_by_role("button", name="Draft reply").click()
                page.get_by_text("Verified reply ready").wait_for(timeout=180_000)
                page.locator(".sentence").first.hover()
            overflow = page.evaluate("document.documentElement.scrollWidth - innerWidth")
            file = out / f"{name}-{w}.png"
            page.screenshot(path=file, full_page=True)
            print(f"{file}  (horizontal overflow: {overflow}px)")
            page.close()
        browser.close()


if __name__ == "__main__":
    main()
