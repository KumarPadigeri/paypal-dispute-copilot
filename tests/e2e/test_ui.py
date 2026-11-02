"""Browser tests: what a judge does on the public demo, in a real browser.

Run: npm --prefix web run build && .venv/bin/pytest -m e2e
Uses Playwright's bundled Chromium in CI, your installed Chrome locally.
"""

import os
import re
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


LIST_VIEW = "localStorage.setItem('view', 'list')"
GRID_ROWS = (
    ".ag-center-cols-container .ag-row"  # AG Grid's body rows (the pinned Case column is separate)
)
FIRST_ROW = GRID_ROWS + '[row-index="0"]'


@pytest.fixture
def page(browser, base_url) -> Page:
    context = browser.new_context(base_url=base_url, viewport={"width": 1366, "height": 768})
    pg = context.new_page()
    yield pg
    context.close()


def test_cards_by_default_and_one_button_switches_to_the_list(page: Page):
    page.goto("/")
    expect(page.locator(".list .row")).to_have_count(2)
    # Icon-only, so its tooltip names the view it opens
    toggle = page.get_by_role("button", name="Grid View")
    expect(toggle).to_have_attribute("data-tip", "Grid View")
    toggle.click()
    expect(page.locator(GRID_ROWS)).to_have_count(2)
    page.reload()  # the choice is remembered
    expect(page.locator(GRID_ROWS)).to_have_count(2)
    page.get_by_role("button", name="Card View").click()
    expect(page.locator(".list .row")).to_have_count(2)


def test_list_shows_disputes_and_opens_a_case_from_its_id(page: Page):
    page.goto("/")
    expect(page.locator("[data-open]")).to_have_count(2)
    expect(page.locator(".list-footer")).to_contain_text("Showing all 2")

    page.get_by_role("button", name="PP-R-FOD-10194708").click()
    expect(page.locator(".evidence-panel .item")).to_have_count(6)
    expect(page.locator(".case-head h2")).to_have_text("Item not received")
    page.keyboard.press("Escape")
    expect(page.locator(".case-pane")).to_have_count(0)


def test_without_pin_draft_is_a_replay_and_cannot_be_sent(page: Page):
    page.goto("/#/case/PP-R-FOD-10194708")
    expect(page.get_by_role("button", name="Draft reply")).to_have_class("btn primary")
    page.get_by_role("button", name="Draft reply").click()
    expect(page.get_by_text("Verified reply ready for your review")).to_be_visible(timeout=15000)
    expect(page.get_by_role("button", name="Draft again")).to_have_class("btn")
    # Each finished "…ing" step was replaced by its result: no line says something is still running.
    expect(page.locator(".timeline .step")).not_to_have_count(0)
    for text in page.locator(".timeline .step").all_inner_texts():
        assert "…" not in text and " is " not in text, text
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
    # The recommended (first) resolution is the blue button.
    expect(page.get_by_role("button", name="Refund the buyer now")).to_have_class("btn primary")
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


def test_light_by_default_even_on_a_dark_system_and_the_toggle_is_remembered(browser, base_url):
    context = browser.new_context(base_url=base_url, color_scheme="dark")
    pg = context.new_page()
    pg.goto("/")
    expect(pg.get_by_role("button", name="Switch to dark theme")).to_be_visible()
    assert pg.evaluate("getComputedStyle(document.body).backgroundColor") == "rgb(244, 245, 247)"
    pg.get_by_role("button", name="Switch to dark theme").click()
    expect(pg.locator("html")).to_have_attribute("data-theme", "dark")
    pg.reload()
    expect(pg.locator("html")).to_have_attribute("data-theme", "dark")
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


@pytest.mark.parametrize(
    "now, text, tone",
    [
        ("2026-11-08T00:00:00Z", "Nov 16 · 8 days left", "muted"),
        ("2026-11-12T00:00:00Z", "Nov 16 · 4 days left", "warn"),
        ("2026-11-14T12:00:00Z", "Nov 16 · 1 day left", "bad"),
        ("2026-11-17T00:00:00Z", "Overdue (was Nov 16)", "bad"),
    ],
)
def test_reply_by_countdown_gets_louder_near_the_deadline(browser, base_url, now, text, tone):
    # The fixture's reply-by date is 2026-11-16T00:29Z; the browser clock is frozen at `now`.
    context = browser.new_context(
        base_url=base_url, timezone_id="UTC", viewport={"width": 1366, "height": 768}
    )
    context.add_init_script(LIST_VIEW)
    pg = context.new_page()
    pg.clock.set_fixed_time(now)
    pg.goto("/")
    cell = pg.locator(FIRST_ROW).locator(".due")
    expect(cell).to_have_text(text)
    expect(cell).to_have_class(f"due {tone}")
    context.close()


def stage_states(pg: Page) -> list[tuple[str, str]]:
    return [
        (li.locator(".stage-label").text_content().strip(), li.get_attribute("class").split()[1])
        for li in pg.locator(".stage").all()
    ]


def test_timeline_shows_the_current_stage_and_explains_each_on_hover(page: Page):
    page.goto("/#/case/PP-R-FOD-10194708")
    expect(page.locator(".stage")).to_have_count(3)
    assert stage_states(page) == [("Inquiry", "now"), ("Claim", "next"), ("Closed", "next")]
    # Dates sit under the stages the case reached: only the opening so far.
    expect(page.locator(".stage-date")).to_have_count(1)
    # The header line gives the deadline, not the status the pill already shows.
    expect(page.locator(".case-head .meta")).not_to_contain_text("waiting for your reply")
    # Pills explain nothing on hover: their words are the whole message.
    expect(page.locator(".pill[data-tip]")).to_have_count(0)
    expect(page.locator(".stage.now")).to_have_attribute("aria-current", "step")
    expect(page.locator(".stage-label").nth(1)).to_have_attribute(
        "data-tip", "PayPal reviews both sides and decides"
    )


def test_timeline_marks_a_claim_skipped_when_the_case_closed_at_inquiry(page: Page):
    def closed(route):
        r = route.fetch()
        route.fulfill(response=r, json={**r.json(), "status": "RESOLVED"})

    page.route("**/api/disputes/PP-R-FOD-10194708", closed)
    page.goto("/#/case/PP-R-FOD-10194708")
    expect(page.locator(".stage")).to_have_count(3)
    assert stage_states(page) == [
        ("Inquiry", "done"),
        ("Claim (skipped)", "skipped"),
        ("Closed", "done"),
    ]
    # The pill says "Resolved"; the header doesn't repeat it in words.
    expect(page.locator(".case-head .meta")).to_have_count(0)


@pytest.mark.parametrize(
    "zone, text",
    [
        # Clocks went back on Nov 1; the date still comes from the zone's rules for that day.
        ("America/Los_Angeles", "Nov 15 · 16 days left"),
        ("Asia/Kolkata", "Nov 16 · 16 days left"),
    ],
)
def test_reply_by_shows_the_viewers_own_time_zone(browser, base_url, zone, text):
    context = browser.new_context(base_url=base_url, timezone_id=zone)
    context.add_init_script(LIST_VIEW)
    pg = context.new_page()
    pg.clock.set_fixed_time("2026-10-30T12:00:00Z")
    pg.goto("/")
    cell = pg.locator(FIRST_ROW).locator(".due")
    expect(cell).to_have_text(text)
    # No tooltip: the line already says everything.
    expect(cell).not_to_have_attribute("data-tip", re.compile(".*"))
    context.close()


def test_footer_counts_what_a_filter_shows_out_of_the_total(page: Page):
    def one_waiting(route):
        r = route.fetch()
        items = r.json()
        items[1]["status"] = "WAITING_FOR_BUYER_RESPONSE"
        route.fulfill(response=r, json=items)

    page.route("**/api/disputes", one_waiting)
    page.goto("/")
    expect(page.locator(".list-footer")).to_contain_text("Showing all 2")
    page.locator(".chip", has_text="Waiting").click()
    expect(page.locator("[data-open]")).to_have_count(1)
    expect(page.locator(".list-footer")).to_contain_text("Showing 1 of 2")


AXE = Path(__file__).parent.parent.parent / "web" / "node_modules" / "axe-core" / "axe.min.js"
WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]


def axe_violations(pg: Page) -> list[str]:
    pg.add_script_tag(path=str(AXE))
    res = pg.evaluate("tags => axe.run(document, {runOnly: {type: 'tag', values: tags}})", WCAG)
    found = [f"{v['id']}: {n['target'][0]}" for v in res["violations"] for n in v["nodes"]]
    # The one known exception: AG Grid wraps its header and body in role="presentation" layout
    # elements inside role="grid". ARIA skips presentation elements when it works out a grid's rows,
    # but axe still flags them. Only this exact finding, on AG Grid's own root, is allowed.
    return [f for f in found if f != "aria-required-children: .ag-root"]


@pytest.mark.parametrize("theme", ["light", "dark"])
@pytest.mark.parametrize(
    "path, ready, view",
    [
        ("/", ".list .row", "grid"),  # cards (the default)
        ("/", GRID_ROWS, "list"),  # AG Grid
        ("/#/case/PP-R-FOD-10194708", ".case-head", "grid"),  # case with a draft option
        ("/#/case/PP-R-TEST-00000002", ".advice", "grid"),  # case with refund advice
    ],
)
def test_every_screen_passes_wcag_aa(browser, base_url, theme, path, ready, view):
    context = browser.new_context(base_url=base_url, viewport={"width": 1366, "height": 900})
    context.add_init_script(f"localStorage.setItem('theme', '{theme}')")
    context.add_init_script(f"localStorage.setItem('view', '{view}')")
    pg = context.new_page()
    pg.goto(path)
    pg.locator(ready).first.wait_for()
    pg.wait_for_timeout(300)  # colors fade in
    assert axe_violations(pg) == []
    context.close()


def test_opening_a_case_by_keyboard_moves_focus_into_it(page: Page):
    page.goto("/")
    page.locator("button[data-open]").first.focus()
    page.keyboard.press("Enter")
    expect(page.locator(".case-head h2")).to_be_focused()
    page.keyboard.press("Escape")
    expect(page.locator("button[data-open]").first).to_be_focused()


def test_grid_sorts_searches_and_exports(page: Page):
    page.add_init_script(LIST_VIEW)
    page.goto("/")
    expect(page.locator(GRID_ROWS)).to_have_count(2)
    amount = page.locator(".ag-header-cell[col-id=amount]")
    amount.locator(".ag-header-cell-label").click()
    expect(amount).to_have_attribute("aria-sort", "ascending")
    page.fill(".search input", "TEST-00000002")
    expect(page.locator(GRID_ROWS)).to_have_count(1)
    expect(page.locator(".list-footer")).to_contain_text("Showing 1 of 2")
    page.fill(".search input", "")
    # Columns can be resized and dragged (both remembered with the sort)
    reason = page.locator(".ag-header-cell[col-id=reason]")
    edge = reason.locator(".ag-header-cell-resize").bounding_box()
    width = reason.bounding_box()["width"]
    page.mouse.move(edge["x"] + edge["width"] / 2, edge["y"] + edge["height"] / 2)
    page.mouse.down()
    page.mouse.move(edge["x"] + 80, edge["y"] + edge["height"] / 2, steps=8)
    page.mouse.up()
    assert reason.bounding_box()["width"] > width + 40
    with page.expect_download() as download:
        page.get_by_role("button", name="Export CSV").click()
    lines = Path(download.value.path()).read_text(encoding="utf-8-sig").splitlines()
    assert lines[0].startswith('"Case","Reason","Amount","Status"')
    assert len(lines) == 3  # header + both disputes


def test_grid_filter_row_contains_text_and_dropdowns(page: Page):
    page.add_init_script(LIST_VIEW)
    page.goto("/")
    footer = page.locator(".list-footer")
    expect(footer).to_contain_text("Showing all 2")
    # Type in the Case filter: matches when the id contains the text
    page.get_by_role("textbox", name="Case filter", exact=True).fill("FOD")
    expect(footer).to_contain_text("Showing 1 of 2")
    page.get_by_role("textbox", name="Case filter", exact=True).fill("")
    expect(footer).to_contain_text("Showing all 2")
    # Status and Reason are dropdowns of their fixed values
    page.get_by_role("combobox", name="Status filter", exact=True).select_option("Resolved")
    expect(page.locator(".grid-empty")).to_have_text("No disputes match these filters.")
    expect(footer).to_contain_text("Showing 0 of 2")
    page.get_by_role("combobox", name="Status filter", exact=True).select_option("")
    page.get_by_role("combobox", name="Reason filter", exact=True).select_option(
        "Item not received"
    )
    expect(footer).to_contain_text("Showing all 2")
    # No sort arrows until a header is clicked; then only that column shows one
    expect(page.locator(".ag-sort-indicator-icon:visible")).to_have_count(0)
    page.locator(".ag-header-cell[col-id=amount] .ag-header-cell-label").click()
    expect(page.locator(".ag-header-cell[col-id=amount] .ag-sort-ascending-icon")).to_be_visible()
    expect(page.locator(".ag-sort-indicator-icon:visible")).to_have_count(1)


def test_card_view_exports_what_it_shows(page: Page):
    page.goto("/")
    expect(page.locator(".list .row")).to_have_count(2)
    page.fill(".search input", "FOD")
    with page.expect_download() as download:
        page.get_by_role("button", name="Export CSV").click()
    lines = Path(download.value.path()).read_text(encoding="utf-8-sig").splitlines()
    assert lines[0].startswith('"Case","Reason","Amount","Status"')
    assert len(lines) == 2 and "PP-R-FOD-10194708" in lines[1]


def test_clear_buttons_for_search_each_filter_and_all_filters(page: Page):
    page.add_init_script(LIST_VIEW)
    page.goto("/")
    footer = page.locator(".list-footer")
    page.fill(".search input", "FOD")
    expect(footer).to_contain_text("Showing 1 of 2")
    page.get_by_role("button", name="Clear search").click()
    expect(page.locator(".search input")).to_have_value("")
    case = page.get_by_role("textbox", name="Case filter", exact=True)
    status = page.get_by_role("combobox", name="Status filter", exact=True)
    clear_all = page.get_by_role("button", name="Clear all filters")
    case.fill("FOD")
    expect(footer).to_contain_text("Showing 1 of 2")
    expect(clear_all).to_have_count(0)  # only once two or more filters are set
    page.get_by_role("button", name="Clear Case filter").click()
    expect(case).to_have_value("")
    expect(footer).to_contain_text("Showing all 2")
    case.fill("FOD")
    status.select_option("Needs reply")
    expect(clear_all).to_be_visible()
    clear_all.click()
    expect(case).to_have_value("")
    expect(status).to_have_value("")
    expect(footer).to_contain_text("Showing all 2")


def test_status_chips_combine(page: Page):
    def one_resolved(route):
        r = route.fetch()
        items = r.json()
        items[1]["status"] = "RESOLVED"
        route.fulfill(response=r, json=items)

    page.route("**/api/disputes", one_resolved)
    page.goto("/")
    footer = page.locator(".list-footer")
    page.locator(".chip", has_text="Needs reply").click()
    expect(footer).to_contain_text("Showing 1 of 2")
    page.locator(".chip", has_text="Resolved").click()  # both on: see both
    expect(footer).to_contain_text("Showing all 2")
    expect(page.locator(".chip.on")).to_have_count(2)
    page.locator(".chip", has_text="Needs reply").click()  # off again
    expect(footer).to_contain_text("Showing 1 of 2")


def test_date_columns_filter_by_a_day_picked_in_the_calendar(browser, base_url):
    context = browser.new_context(base_url=base_url, timezone_id="UTC")
    context.add_init_script(LIST_VIEW)
    page = context.new_page()
    page.clock.set_fixed_time("2026-11-02T12:00:00Z")  # the calendar opens on November 2026
    page.goto("/")
    footer = page.locator(".list-footer")
    page.get_by_role("button", name="Reply by filter", exact=True).click()
    calendar = page.get_by_role("dialog", name="Pick a reply by day")
    expect(calendar).to_be_visible()
    calendar.get_by_role(
        "button", name="16 November 2026, Monday"
    ).click()  # the fixture's reply-by day
    expect(calendar).to_have_count(0)
    expect(page.get_by_role("button", name="Reply by filter: Nov 16")).to_be_visible()
    expect(footer).to_contain_text("Showing all 2")
    page.get_by_role("button", name="Clear Reply by filter").click()
    page.get_by_role("button", name="Opened filter", exact=True).click()
    page.get_by_role("dialog").get_by_role("button", name="3 November 2026, Tuesday").click()
    expect(footer).to_contain_text("Showing 0 of 2")
    page.get_by_role("button", name="Opened filter: Nov 3").focus()
    page.keyboard.press("Enter")
    page.keyboard.press("Escape")  # Esc closes the calendar only
    expect(page.get_by_role("dialog")).to_have_count(0)
    context.close()


def test_insights_answer_what_is_at_stake_and_why(page: Page):
    page.goto("/")
    page.get_by_role("link", name="Insights").click()
    expect(page.get_by_role("heading", name="Insights")).to_be_focused()
    charts = page.locator(".insight-chart[role=img]")
    expect(charts).to_have_count(2)
    # Both fixture disputes need a reply (Nov 16) and are "Item not received"
    expect(charts.nth(0)).to_have_attribute(
        "aria-label", re.compile(r"^Money at stake, by reply deadline: ")
    )
    expect(charts.nth(1)).to_have_attribute(
        "aria-label", re.compile(r"Item not received \(2 cases\)", re.I)
    )
    assert axe_violations(page) == []
    page.get_by_role("link", name="Back to disputes").first.click()
    expect(page.locator(".list-footer")).to_be_visible()


def test_skip_link_moves_focus_without_leaving_the_page(page: Page):
    page.goto("/#/insights")
    expect(page.get_by_role("heading", name="Insights")).to_be_focused()
    page.get_by_role("link", name="Skip to content").focus()
    page.keyboard.press("Enter")
    expect(page.locator("main#main")).to_be_focused()
    assert page.evaluate("location.hash") == "#/insights"
