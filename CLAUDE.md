# PayPal Dispute Copilot — PayPal AI Hackathon 2026

## Goal
Build an AI + PayPal project for the PayPal AI Hackathon (https://paypalaihackathon.devpost.com/).
Submissions close **Nov 12, 2026, 12:00 pm Pacific (noon)**; aim to submit **Nov 11**. Winners Dec 21.
Full brief (idea, architecture, stack, plan, checklist, open questions):
https://claude.ai/artifact/AeBrcqJzSunXyAwy9GZzSv — read it with the Claude Docs tools before starting.

Recommended idea: **Dispute Copilot** — agents gather PayPal sandbox evidence (transaction, invoice, shipment
tracking) for a dispute and draft a reply where every sentence links to its evidence; a Verifier agent removes
unproven claims; the merchant approves before sending. Backup: Shop Agent (agentic commerce). The Oct 28–29
spike decides (can test disputes be created in the sandbox?).

## Hard rules
- The project must meaningfully use both PayPal and AI.
- Sandbox money and made-up customers only; no real personal data.
- Repo will be PUBLIC: never commit .env, PayPal client secrets or any keys.
- Facts and numbers come from PayPal tools and code; the AI only writes and checks.
- Do NOT touch ~/projects/inside-the-game: it is frozen for judging until Nov 10.

## Stack (reuse what worked in Inside the Game)
Python 3.11 + Microsoft Agent Framework, Microsoft Foundry (gpt-5.4-mini, AzureCliCredential, pay-as-you-go
subscription with a $10 budget alert), PayPal MCP server or Agent Toolkit (sandbox), FastAPI + SSE,
React + TypeScript + Vite, pytest, GitHub Actions. Hosting: Render (hackathon partner) or Azure Container Apps.

## How to work with me
- I'm learning: explain changes in simple words before making them. Small steps: one feature, run it, move on.
- Commit locally after each feature; push only after I test and say so. Before each commit: secret scan,
  tests, build and lint. Commit email: the GitHub noreply address.
- Keep everything free or cheap.
- Check UI changes at desktop (1920, 1600, 1366 px) and phone (375 px) with screenshots; calm graphite palette.
- My shell is zsh: wrap multi-command scripts with variables in `bash -c`.
- Concise answers; recommend one option instead of listing many.

## Reminder: Inside the Game, Nov 10 step
Inside the Game's backend is kept always awake for judging. On or after **Nov 10, 2026** (judging ends), put it
back to sleep (no code change, just a setting): `az containerapp update -n inside-the-game-api -g rg-inside-the-game
--min-replicas 0`. Remind me if I forget. After Nov 20 (winners), ask me about keeping it as a ~$0 portfolio demo.
