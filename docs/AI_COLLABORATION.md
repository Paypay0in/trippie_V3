# Trippie AI Collaboration Protocol

## Purpose
Use GitHub Issues as the canonical ticket queue and Pull Requests as the review boundary. Claude is the implementation agent; GPT is the specification and review agent. Both roles are logical: automated model calls require separately configured API credentials and a runner.

## Roles
- Founder: approves production deployment, destructive data changes, secrets, spending, and merges.
- Planner / Reviewer (GPT): writes acceptance criteria, reviews PR diff and CI evidence; never claims browser testing without evidence.
- Implementer (Claude): works on a feature branch, adds tests, opens a draft PR, and reports limitations.

## Ticket contract
Every GitHub Issue must contain: problem, scope, non-goals, acceptance criteria, test plan, priority (P0/P1/P2), and security/data impact.

## Handoff protocol
1. Founder approves a ticket's scope.
2. Implementer creates a branch named `ai/issue-<number>-<slug>`.
3. Implementer opens a draft PR referencing the issue, with implementation notes, test commands, test results, and known risks.
4. CI runs TypeScript checks and production build.
5. Reviewer inspects actual diff and CI results, requests changes or recommends approval.
6. Founder authorizes merge and production deployment.

## Guardrails
- No direct pushes to `main` from agents.
- No production deploy, payments, or destructive migrations without explicit Founder approval.
- No secrets in GitHub issues, PR descriptions, logs, or client bundles.
- Maximum two automated revision cycles per ticket before escalation.
- Reviewers must not approve their own unverified output.
- All test claims must link to a command output, CI run, or reproducible steps.
- Agents should have least-privilege tokens and capped API spending.

## Current implementation status
This repository contains protocol, CI, and a local interactive Claude Code task launcher (see `docs/CLAUDE_CODE_SETUP.md`). It does **not** contain an autonomous Claude/GPT orchestrator, automatic GPT PR reviewer, or API integrations. Do not describe it as unattended multi-agent automation.

## Next steps
1. Audit and remove client-side Gemini API key injection.
2. Add authenticated persistence and authorization to Socket.IO trip rooms.
3. Add unit/integration/browser tests for Phase 1 collaboration.
4. Use Claude Code locally under the existing subscription and submit Draft PRs for ChatGPT review. A separately hosted autonomous orchestrator would require its own authorization, credentials, and budget.
