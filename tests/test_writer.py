import json
from pathlib import Path

from copilot.evidence import build_case
from copilot.writer import (
    Draft,
    Sentence,
    answered_claims,
    build_prompt,
    check_citations,
    render,
    split_claims,
)

FIXTURES = Path(__file__).parent / "fixtures"


def case():
    d = json.loads((FIXTURES / "dispute_not_received.json").read_text())
    trackers = json.loads((FIXTURES / "trackers.json").read_text())
    return build_case(d, trackers)


def test_prompt_has_evidence_and_claims_but_no_raw_paypal_ids():
    p = build_prompt(case())
    assert "E4: The item was shipped via USPS" in p
    assert "has not arrived" in p
    assert "PROOF_OF_FULFILLMENT" in p
    # The AI never sees the transaction or case ids (only the tracking number via E4).
    assert "PP-R-FOD-10194708" not in p
    assert "Y9BCN5PVNK2YQ" not in p
    assert "example.com" not in p


def test_check_citations_accepts_a_fully_cited_draft():
    draft = Draft(
        sentences=[
            Sentence(text="The buyer paid 49.99 USD.", cites=["E1"]),
            Sentence(text="The item was shipped via USPS.", cites=["E4"]),
        ]
    )
    assert check_citations(draft, case()) == []


def test_check_citations_flags_missing_and_unknown_ids():
    draft = Draft(
        sentences=[
            Sentence(text="We always ship fast.", cites=[]),
            Sentence(text="It was delivered.", cites=["E9"]),
        ]
    )
    problems = check_citations(draft, case())
    assert len(problems) == 2
    assert "cites no evidence" in problems[0]
    assert "unknown evidence E9" in problems[1]


def test_render_joins_sentences_without_citations():
    draft = Draft(
        sentences=[Sentence(text="One.", cites=["E1"]), Sentence(text="Two.", cites=["E2"])]
    )
    assert render(draft) == "One. Two."


def test_buyer_message_is_split_into_numbered_claims():
    claims = split_claims(case())
    assert claims[0] == "I paid $49.99 on Oct 26 for a Ceramic Pour-Over Coffee Set."
    assert claims[1] == "It has not arrived and I have no tracking information."
    assert len(claims) == 4
    assert 'C2: "It has not arrived' in build_prompt(case())


def test_check_citations_flags_ids_in_text_and_unknown_claims():
    draft = Draft(
        sentences=[
            Sentence(text='It shipped via USPS. ["E4"]', cites=["E4"]),
            Sentence(text="A tracking number exists.", cites=["E4"], answers=["C9"]),
        ]
    )
    problems = check_citations(draft, case())
    assert any("id in its text" in p for p in problems)
    assert any("unknown claim C9" in p for p in problems)


def test_answered_claims_collects_claim_ids():
    draft = Draft(
        sentences=[
            Sentence(text="A.", cites=["E4"], answers=["C2"]),
            Sentence(text="B.", cites=["E1"], answers=["C1", "C2"]),
        ]
    )
    assert answered_claims(draft) == {"C1", "C2"}
