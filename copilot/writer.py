"""Writer agent: drafts the seller's reply, one cited sentence at a time.

The AI only sees the numbered evidence and the buyer's numbered claims. It
returns structured sentences; plain code then checks every citation.
"""

import re

from agent_framework import Agent
from pydantic import BaseModel, Field

from copilot.evidence import DisputeCase

INSTRUCTIONS = """\
You write a seller's response to a PayPal dispute, addressed to PayPal's case reviewer.

How to argue:
1. Open by answering the buyer's main complaint with the strongest evidence.
2. Go through the buyer's claims (C1, C2, ...). For every claim the evidence can
   answer, write a sentence that answers it directly and list the claim in "answers".
   If the evidence says nothing about a claim, leave it out: never deny or confirm it.
3. Compare facts across evidence items, especially dates: when the item shipped
   versus when the case was opened. Such a sentence cites every item it uses.
   State the comparison as plain facts ("the item shipped on Oct 27, 2026, the same
   day the case was opened"). Dates have no times, so never claim an order, a cause
   or an intent: no "before", "after", "immediately", "so", "which means", "fulfilled".
4. No filler: do not restate the dispute reason or list facts that do not help.
   Never write about what the evidence does not contain.
5. Do not write a closing request; the app adds it.

Rules:
- Use ONLY facts from the numbered evidence list. Never add facts, dates, amounts,
  carriers or promises that are not in the evidence.
- Every sentence lists the evidence ids it relies on in "cites".
- Never write ids like E1 or C2 in the sentence text; they belong only in "cites"
  and "answers".
- The buyer's claims are not facts. Answer them; never cite them as evidence.
- Say only what the evidence says. "Shipped" is not "delivered".
- Do not mention transaction ids or case ids. Tracking numbers may be quoted when
  they appear in the evidence.
- Calm, factual and professional; no blame and no emotion.
- 2 to 4 short sentences.
"""

MESSAGE_INSTRUCTIONS = """\
You write a short message from a seller to the buyer in a PayPal dispute. PayPal shows it
to the buyer in the case.

How to write:
1. Start with the fact that helps the buyer most, such as the carrier and tracking
   number, so they can follow their parcel themselves.
2. Answer the buyer's claims (C1, C2, ...) that the evidence can answer, and list each
   in "answers". If the evidence says nothing about a claim, leave it out.
3. Speak to the buyer directly ("your order"). Warm, calm and helpful; no blame and
   no pressure to close the case.
4. No greeting and no sign-off; write only the sentences that carry facts.

Rules:
- Use ONLY facts from the numbered evidence list. Never add facts, dates, amounts,
  carriers or promises (no delivery dates, refunds or discounts) that are not in it.
- Every sentence lists the evidence ids it relies on in "cites".
- Never write ids like E1 or C2 in the sentence text; they belong only in "cites"
  and "answers".
- The buyer's claims are not facts. Answer them; never cite them as evidence.
- Say only what the evidence says. "Shipped" is not "delivered".
- Do not mention transaction ids or case ids. Tracking numbers may be quoted.
- 1 to 3 short sentences.
"""

# What the Writer is asked to write, by kind of draft.
TASKS = {"reply": "Write the seller's response.", "message": "Write the message to the buyer."}

ID_IN_TEXT = re.compile(r"\b[EC]\d+\b")


class Sentence(BaseModel):
    text: str = Field(description="One sentence of the reply, with no ids in it")
    cites: list[str] = Field(description='Evidence ids this sentence relies on, e.g. ["E1"]')
    answers: list[str] = Field(
        default_factory=list, description='Buyer claim ids this sentence answers, e.g. ["C2"]'
    )


class Draft(BaseModel):
    sentences: list[Sentence]


def split_claims(case: DisputeCase) -> list[str]:
    """Buyer messages split into single sentences: C1, C2, ..."""
    return [
        part.strip()
        for message in case.buyer_claims
        for part in re.split(r"(?<=[.!?])\s+", message)
        if part.strip()
    ]


def build_prompt(case: DisputeCase, task: str = TASKS["reply"]) -> str:
    claims = split_claims(case)
    claim_lines = "\n".join(f'C{i}: "{c}"' for i, c in enumerate(claims, start=1))
    evidence = "\n".join(f"{e.id}: {e.text}" for e in case.evidence)
    requested = ", ".join(case.requested_from_seller) or "nothing specific"
    return (
        f"Dispute reason: {case.reason}. Amount: {case.amount}.\n"
        f"PayPal asks the seller for: {requested}.\n\n"
        f"The buyer's claims:\n{claim_lines or '(no message)'}\n\n"
        f"Evidence:\n{evidence}\n\n" + task
    )


def sentence_problems(s: Sentence, case: DisputeCase) -> list[str]:
    known = {e.id for e in case.evidence}
    claim_ids = {f"C{i}" for i in range(1, len(split_claims(case)) + 1)}
    problems = []
    if not s.cites:
        problems.append("cites no evidence")
    problems += [f"cites unknown evidence {c}" for c in s.cites if c not in known]
    problems += [f"answers unknown claim {a}" for a in s.answers if a not in claim_ids]
    if ID_IN_TEXT.search(s.text):
        problems.append("has an id in its text")
    return problems


def check_citations(draft: Draft, case: DisputeCase) -> list[str]:
    """Problems a human must never see in a sent reply. Empty list = all good."""
    return [
        f"Sentence {i} {p}: {s.text!r}"
        for i, s in enumerate(draft.sentences, start=1)
        for p in sentence_problems(s, case)
    ]


def answered_claims(draft: Draft) -> set[str]:
    return {a for s in draft.sentences for a in s.answers}


CLOSING = "Based on this evidence, we ask PayPal to close the case in the seller's favor."


def with_closing(draft: Draft) -> Draft:
    """Adds the fixed closing request (code, not the AI); it cites what the reply used."""
    if not draft.sentences or draft.sentences[-1].text == CLOSING:
        return draft
    used = sorted({c for s in draft.sentences for c in s.cites}, key=lambda c: int(c[1:]))
    return Draft(sentences=[*draft.sentences, Sentence(text=CLOSING, cites=used)])


def render(draft: Draft) -> str:
    return " ".join(s.text.strip() for s in draft.sentences)


def make_writer(client, kind: str = "reply") -> Agent:
    return Agent(client, MESSAGE_INSTRUCTIONS if kind == "message" else INSTRUCTIONS, name="Writer")


async def write_draft(
    writer: Agent, case: DisputeCase, feedback: str | None = None, kind: str = "reply"
) -> Draft:
    prompt = build_prompt(case, TASKS[kind]) + (f"\n\n{feedback}" if feedback else "")
    result = await writer.run(prompt, options={"response_format": Draft})
    return result.value
