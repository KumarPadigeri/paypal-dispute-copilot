"""Screenshot the UI at the widths we check: 1920, 1600, 1366 (desktop) and 375 (phone).

Uses the installed Google Chrome through Playwright. Needs the API and Vite running.

Run: .venv/bin/python -m scripts.screenshots <out_dir> [path=/] [name=page]
"""

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

SIZES = [(1920, 1080), (1600, 900), (1366, 768), (375, 812)]
BASE = "http://localhost:5173"


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    out = Path(sys.argv[1])
    path = sys.argv[2] if len(sys.argv) > 2 else "/"
    name = sys.argv[3] if len(sys.argv) > 3 else "page"
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
            overflow = page.evaluate("document.documentElement.scrollWidth - innerWidth")
            file = out / f"{name}-{w}.png"
            page.screenshot(path=file, full_page=True)
            print(f"{file}  (horizontal overflow: {overflow}px)")
            page.close()
        browser.close()


if __name__ == "__main__":
    main()
