"""Browser tests: what a judge does on the public demo, in a real browser.

Run: npm --prefix web run build && .venv/bin/pytest -m e2e
Uses Playwright's bundled Chromium in CI, your installed Chrome locally.
"""

import os
import socket
import threading
import time
from pathlib import Path

import pytest
import uvicorn
from playwright.sync_api import Page, expect, sync_playwright

from tests.e2e.fake_app import PIN, make

pytestmark = pytest.mark.e2e
WEB_DIST = Path(__file__).parent.parent.parent / "web" / "dist"


@pytest.fixture(scope="module")
def base_url():
    if not (WEB_DIST / "index.html").is_file():
        pytest.fail("Build the web page first: npm --prefix web run build")
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    server = uvicorn.Server(
        uvicorn.Config(make(WEB_DIST), host="127.0.0.1", port=port, log_level="warning")
    )
    threading.Thread(target=server.run, daemon=True).start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.05)
    yield f"http://127.0.0.1:{port}"
    server.should_exit = True


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch() if os.getenv("CI") else p.chromium.launch(channel="chrome")
        yield b
        b.close()


@pytest.fixture
def page(browser, base_url) -> Page:
    context = browser.new_context(base_url=base_url, viewport={"width": 1366, "height": 768})
    pg = context.new_page()
    yield pg
    context.close()


def test_list_shows_disputes_and_opens_a_case_from_its_id(page: Page):
    page.goto("/")
    expect(page.locator("tbody tr")).to_have_count(2)
    page.get_by_role("button", name="PP-R-FOD-10194708").click()
    expect(page.locator(".evidence-panel .item")).to_have_count(6)
    expect(page.locator(".case-head h2")).to_have_text("Item not received")
    page.keyboard.press("Escape")
    expect(page.locator(".case-pane")).to_have_count(0)


def test_without_pin_draft_is_a_replay_and_cannot_be_sent(page: Page):
    page.goto("/#/case/PP-R-FOD-10194708")
    page.get_by_role("button", name="Draft reply").click()
    expect(page.get_by_text("Verified reply ready for your review")).to_be_visible(timeout=15000)
    expect(page.locator(".replay-label")).to_contain_text("Replay of a real run")
    expect(page.get_by_role("button", name="Approve & send to PayPal")).to_be_disabled()
    status = page.evaluate(
        "fetch('/api/disputes/PP-R-FOD-10194708/send', {method: 'POST'}).then(r => r.status)"
    )
    assert status == 403


def test_pointing_at_a_sentence_highlights_its_evidence(page: Page):
    page.goto("/#/case/PP-R-FOD-10194708")
    page.get_by_role("button", name="Draft reply").click()
    expect(page.locator(".sentence").first).to_be_visible(timeout=15000)
    page.locator(".sentence").first.hover()
    expect(page.locator(".evidence-panel .item.lit").first).to_be_visible()


def test_case_without_tracking_gets_advice_not_a_draft(page: Page):
    page.goto("/#/case/PP-R-TEST-00000002")
    expect(page.locator(".advice h3")).to_have_text("No proof of shipping on file")
    expect(page.get_by_role("button", name="Draft reply")).to_be_disabled()
    page.get_by_role("button", name="Refund the buyer now").click()
    expect(page.locator(".advice-confirm blockquote")).to_contain_text("refund the full amount")
    page.get_by_role("button", name="Cancel").click()  # never confirmed: nothing is sent


def test_wrong_pin_is_refused_and_right_pin_unlocks(page: Page):
    page.goto("/#/case/PP-R-FOD-10194708")
    page.get_by_role("button", name="Have a demo PIN? Unlock live AI").click()
    page.get_by_placeholder("Demo PIN").fill("0000")
    page.get_by_role("button", name="Unlock").click()
    expect(page.get_by_role("alert")).to_have_text("That PIN didn't work.")
    page.get_by_placeholder("Demo PIN").fill(PIN)
    page.get_by_role("button", name="Unlock").click()
    expect(page.locator(".demo-note")).to_have_count(0)


def test_theme_follows_the_system_then_the_toggle_is_remembered(browser, base_url):
    context = browser.new_context(base_url=base_url, color_scheme="dark")
    pg = context.new_page()
    pg.goto("/")
    expect(pg.get_by_role("button", name="Switch to light theme")).to_be_visible()
    pg.get_by_role("button", name="Switch to light theme").click()
    expect(pg.locator("html")).to_have_attribute("data-theme", "light")
    pg.reload()
    expect(pg.locator("html")).to_have_attribute("data-theme", "light")
    context.close()


def test_phone_layout_has_no_sideways_scroll(browser, base_url):
    context = browser.new_context(
        base_url=base_url, viewport={"width": 375, "height": 812}, is_mobile=True, has_touch=True
    )
    pg = context.new_page()
    # On a phone the open case covers the screen, so each page has its own landmark.
    for path, landmark in (("/", ".row"), ("/#/case/PP-R-FOD-10194708", ".case-head h2")):
        pg.goto(path)
        expect(pg.locator(landmark).first).to_be_visible()
        assert pg.evaluate("document.documentElement.scrollWidth - innerWidth") == 0
    context.close()
