"""The write → verify → rewrite → remove loop, with fake agents (no AI calls)."""

import asyncio
import json
from pathlib import Path

from copilot.evidence import build_case
from copilot.pipeline import draft_reply
from copilot.verifier import Verdict
from copilot.verifier import build_prompt as verifier_prompt
from copilot.writer import CLOSING, Draft, Sentence

FIXTURES = Path(__file__).parent / "fixtures"
CASE = build_case(
    json.loads((FIXTURES / "dispute_not_received.json").read_text()),
    json.loads((FIXTURES / "trackers.json").read_text()),
)

GOOD = Sentence(text="It shipped via USPS on Oct 27, 2026.", cites=["E4"], answers=["C2"])
TOO_FAR = Sentence(text="It shipped before the case was opened.", cites=["E4", "E5"])
FIXED = Sentence(text="It shipped on the day the case was opened.", cites=["E4", "E5"])
UNCITED = Sentence(text="We always ship fast.", cites=[])


def run(drafts: list[Draft], judge) -> tuple:
    """drafts: what the fake Writer returns per call; judge(text) -> supported?"""
    calls = {"write": [], "verify": 0}

    async def write(case, feedback):
        calls["write"].append(feedback)
        return drafts[len(calls["write"]) - 1]

    async def verify(case, draft):
        calls["verify"] += 1
        return [
            Verdict(sentence=i, supported=judge(s.text), reason="adds a time order")
            for i, s in enumerate(draft.sentences, start=1)
        ]

    result = asyncio.run(draft_reply(CASE, write, verify))
    assert result.draft.sentences[-1].text == CLOSING  # code always adds the closing request
    result.draft.sentences = result.draft.sentences[:-1]
    return result, calls


def test_clean_draft_passes_in_one_round():
    result, calls = run([Draft(sentences=[GOOD])], judge=lambda t: True)
    assert result.rounds == 1
    assert result.draft.sentences == [GOOD]
    assert result.removed == []
    assert calls["write"] == [None]


def test_rejected_sentence_is_rewritten_once_with_feedback():
    drafts = [Draft(sentences=[GOOD, TOO_FAR]), Draft(sentences=[GOOD, FIXED])]
    result, calls = run(drafts, judge=lambda t: "before" not in t)
    assert result.rounds == 2
    assert result.draft.sentences == [GOOD, FIXED]
    assert result.removed == []
    assert result.first_rejections[0].sentence == TOO_FAR.text
    assert "before the case was opened" in calls["write"][1]
    assert "adds a time order" in calls["write"][1]


def test_still_unproven_after_rewrite_is_removed():
    drafts = [Draft(sentences=[GOOD, TOO_FAR]), Draft(sentences=[GOOD, TOO_FAR])]
    result, calls = run(drafts, judge=lambda t: "before" not in t)
    assert result.draft.sentences == [GOOD]
    assert [r.sentence for r in result.removed] == [TOO_FAR.text]
    assert len(calls["write"]) == 2  # never a third try


def test_code_check_rejects_uncited_sentence_without_asking_the_verifier():
    drafts = [Draft(sentences=[GOOD, UNCITED]), Draft(sentences=[GOOD, UNCITED])]
    result, _ = run(drafts, judge=lambda t: True)
    assert result.draft.sentences == [GOOD]
    assert result.removed[0].reason == "cites no evidence"


def test_verifier_sees_only_the_cited_evidence():
    p = verifier_prompt(CASE, Draft(sentences=[GOOD]))
    assert "shipped via USPS" in p
    assert "49.99 USD" not in p  # E1 is not cited, so not shown
    assert "has not arrived" not in p  # buyer claims never reach the Verifier


def test_closing_request_is_written_by_code_and_cites_what_the_reply_used():
    from copilot.writer import with_closing

    closed = with_closing(Draft(sentences=[GOOD, FIXED]))
    assert closed.sentences[-1] == Sentence(text=CLOSING, cites=["E4", "E5"])
    assert with_closing(closed) == closed  # never added twice
    assert with_closing(Draft(sentences=[])).sentences == []  # nothing proven: no request
