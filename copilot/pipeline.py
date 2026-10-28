"""Write → check → verify → (one rewrite) → remove what is still unproven.

Plain code decides what survives; the agents only write and judge.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from copilot.evidence import DisputeCase
from copilot.verifier import Verdict
from copilot.writer import Draft, Sentence, answered_claims, render, sentence_problems

WriteFn = Callable[[DisputeCase, str | None], Awaitable[Draft]]
VerifyFn = Callable[[DisputeCase, Draft], Awaitable[list[Verdict]]]


@dataclass
class Rejection:
    sentence: str
    reason: str


@dataclass
class Result:
    draft: Draft
    removed: list[Rejection] = field(default_factory=list)
    rounds: int = 1
    first_rejections: list[Rejection] = field(default_factory=list)


async def review(case: DisputeCase, draft: Draft, verify: VerifyFn) -> dict[int, str]:
    """Sentence index (0-based) → why it was rejected. Code checks first, then the Verifier."""
    rejected: dict[int, str] = {}
    for i, s in enumerate(draft.sentences):
        problems = sentence_problems(s, case)
        if problems:
            rejected[i] = "; ".join(problems)

    to_verify = [i for i in range(len(draft.sentences)) if i not in rejected]
    if to_verify:
        subset = Draft(sentences=[draft.sentences[i] for i in to_verify])
        verdicts = {v.sentence: v for v in await verify(case, subset)}
        for n, i in enumerate(to_verify, start=1):
            v = verdicts.get(n)
            if v is None:
                rejected[i] = "not checked by the Verifier"
            elif not v.supported:
                rejected[i] = v.reason
    return rejected


def feedback(draft: Draft, rejected: dict[int, str]) -> str:
    lines = [f'- "{draft.sentences[i].text}" was rejected: {why}' for i, why in rejected.items()]
    return (
        "Your previous draft had sentences that the evidence does not fully support:\n"
        + "\n".join(lines)
        + "\nWrite the whole response again. Fix those sentences so they say only what "
        "their evidence says, or drop them."
    )


def final_payload(result: Result) -> dict:
    """What the UI receives as the last event of a draft."""
    return {
        "sentences": result.draft.model_dump()["sentences"],
        "removed": [{"sentence": r.sentence, "reason": r.reason} for r in result.removed],
        "rounds": result.rounds,
        "answered": sorted(answered_claims(result.draft)),
        "reply": render(result.draft),
    }


def _verdicts(draft: Draft, rejected: dict[int, str]) -> list[dict]:
    return [
        {"sentence": s.text, "supported": i not in rejected, "reason": rejected.get(i)}
        for i, s in enumerate(draft.sentences)
    ]


async def draft_reply(
    case: DisputeCase,
    write: WriteFn,
    verify: VerifyFn,
    on_event: Callable[[str, dict], None] = lambda name, data: None,
) -> Result:
    """`on_event(name, data)` reports progress: writing, draft, verifying, verdicts, rewriting."""
    on_event("writing", {"round": 1})
    draft = await write(case, None)
    on_event("draft", {"round": 1, "sentences": draft.model_dump()["sentences"]})
    on_event("verifying", {"round": 1})
    rejected = await review(case, draft, verify)
    on_event("verdicts", {"round": 1, "verdicts": _verdicts(draft, rejected)})
    if not rejected:
        return Result(draft=draft)

    first = [Rejection(draft.sentences[i].text, why) for i, why in rejected.items()]
    on_event("rewriting", {"round": 2, "rejected": len(first)})
    draft = await write(case, feedback(draft, rejected))
    on_event("draft", {"round": 2, "sentences": draft.model_dump()["sentences"]})
    on_event("verifying", {"round": 2})
    rejected = await review(case, draft, verify)
    on_event("verdicts", {"round": 2, "verdicts": _verdicts(draft, rejected)})

    kept: list[Sentence] = [s for i, s in enumerate(draft.sentences) if i not in rejected]
    removed = [Rejection(draft.sentences[i].text, why) for i, why in rejected.items()]
    return Result(Draft(sentences=kept), removed, rounds=2, first_rejections=first)
