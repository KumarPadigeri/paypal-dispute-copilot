"""Verifier agent: checks each sentence against ONLY the evidence it cites."""

from agent_framework import Agent
from pydantic import BaseModel, Field

from copilot.evidence import DisputeCase
from copilot.writer import Draft

INSTRUCTIONS = """\
You check a seller's dispute response, one sentence at a time. You are strict.

For each sentence you get ONLY the evidence it cites. Decide whether that evidence
fully supports it:
- Supported: every fact in the sentence is stated in, or follows directly from,
  the cited evidence alone.
- Not supported: the sentence adds anything the cited evidence does not say,
  such as a time order not shown ("before", "after"), delivery or receipt when
  the evidence only says shipped, motives, promises, or numbers and dates that
  do not match.
- A request such as "Please close the case in the seller's favor" is not a fact
  and needs no evidence of its own. Judge only the facts it mentions as reasons:
  if those are in its cited evidence, the sentence is supported.

Give one verdict per sentence, in the same order, with a short plain reason.
When a sentence is not supported, name the exact words that go too far.
"""


class Verdict(BaseModel):
    sentence: int = Field(description="Sentence number, starting at 1")
    supported: bool
    reason: str = Field(description="Short plain reason; quote the words that go too far")


class Verdicts(BaseModel):
    verdicts: list[Verdict]


def build_prompt(case: DisputeCase, draft: Draft) -> str:
    by_id = {e.id: e.text for e in case.evidence}
    blocks = []
    for i, s in enumerate(draft.sentences, start=1):
        cited = "\n".join(f"  - {by_id[c]}" for c in s.cites if c in by_id) or "  - (none)"
        blocks.append(f'Sentence {i}: "{s.text}"\nIts cited evidence:\n{cited}')
    return "\n\n".join(blocks)


def make_verifier(client) -> Agent:
    return Agent(client, INSTRUCTIONS, name="Verifier")


async def verify_draft(verifier: Agent, case: DisputeCase, draft: Draft) -> list[Verdict]:
    result = await verifier.run(build_prompt(case, draft), options={"response_format": Verdicts})
    return result.value.verdicts
