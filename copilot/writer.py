"""Writer agent: drafts the seller's reply, one cited sentence at a time.

The AI only sees the numbered evidence and the buyer's words. It returns
structured sentences; plain code then checks every citation.
"""

from agent_framework import Agent
from pydantic import BaseModel, Field

from copilot.evidence import DisputeCase

INSTRUCTIONS = """\
You write a seller's response to a PayPal dispute, addressed to PayPal's case reviewer.

Rules:
- Use ONLY facts from the numbered evidence list. Never add facts, dates, amounts,
  carriers or promises that are not in the evidence.
- Every sentence must cite the evidence ids it relies on, e.g. ["E1", "E4"].
- The buyer's statements are claims, not facts. Answer them; never cite them.
- Say only what the evidence says. "Shipped" is not "delivered".
- Do not mention transaction ids, case ids or evidence ids in the text itself.
  Tracking numbers may be quoted when they appear in the evidence.
- Calm, factual and professional; no blame and no emotion.
- 3 to 6 short sentences.
"""


class Sentence(BaseModel):
    text: str = Field(description="One sentence of the reply")
    cites: list[str] = Field(description='Evidence ids this sentence relies on, e.g. ["E1"]')


class Draft(BaseModel):
    sentences: list[Sentence]


def build_prompt(case: DisputeCase) -> str:
    claims = "\n".join(f'- "{c}"' for c in case.buyer_claims) or "- (no message)"
    evidence = "\n".join(f"{e.id}: {e.text}" for e in case.evidence)
    requested = ", ".join(case.requested_from_seller) or "nothing specific"
    return (
        f"Dispute reason: {case.reason}. Amount: {case.amount}.\n"
        f"PayPal asks the seller for: {requested}.\n\n"
        f"The buyer says:\n{claims}\n\n"
        f"Evidence:\n{evidence}\n\n"
        "Write the seller's response."
    )


def check_citations(draft: Draft, case: DisputeCase) -> list[str]:
    """Problems a human must never see in a sent reply. Empty list = all good."""
    known = {e.id for e in case.evidence}
    problems = []
    for i, s in enumerate(draft.sentences, start=1):
        if not s.cites:
            problems.append(f"Sentence {i} cites no evidence: {s.text!r}")
        for c in s.cites:
            if c not in known:
                problems.append(f"Sentence {i} cites unknown evidence {c}: {s.text!r}")
    return problems


def render(draft: Draft) -> str:
    return " ".join(s.text.strip() for s in draft.sentences)


def make_writer(client) -> Agent:
    return Agent(client, INSTRUCTIONS, name="Writer")


async def write_draft(writer: Agent, case: DisputeCase) -> Draft:
    result = await writer.run(build_prompt(case), options={"response_format": Draft})
    return result.value
