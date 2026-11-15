# Claude Pro / Claude Code local workflow

This is the **subscription-first, human-in-the-loop** option. It does not require an Anthropic API key in GitHub Actions and does not add per-token Anthropic API billing. Claude Code access and usage limits depend on your current Claude plan. A Pro subscription is **not** a hosted autonomous GitHub worker.

## One-time setup (on your own Mac)
1. Install Node.js 22+, Git, GitHub CLI (`gh`), and Claude Code from the official Anthropic documentation.
2. Authenticate with `gh auth login` and `claude`, selecting your existing Claude subscription login when offered. Do not paste credentials into GitHub.
3. Clone `https://github.com/Paypay0in/trippie_V3.git`.
4. Wait for PR #1 to be approved and merged so `CLAUDE.md` and the script exist on `main`.
5. Run `npm ci` in the repository.

## Each authorized task
1. Founder reviews the GitHub Issue and explicitly authorizes its implementation.
2. In the cloned repo, run `bash scripts/start-claude-task.sh 2` (replace 2 with the authorized issue number).
3. The script fetches `main`, checks for uncommitted changes, creates a task branch, displays the issue, and launches interactive `claude`.
4. Ask Claude to implement **only** the approved acceptance criteria; review permission prompts.
5. Verify the diff and tests; commit and push the task branch.
6. Open a **Draft PR** with `gh pr create --draft --base main --fill`.
7. Ask ChatGPT to review the PR by URL. ChatGPT checks diff, CI evidence, and risks, then requests changes if needed.
8. Founder approves merge and production deployment separately.

## Limits and costs
- No Anthropic API key, API-triggered GitHub workflow, paid automation runner, or recurring Claude API bill is configured by this setup.
- Local Claude Code sessions require your computer/session to be running. Subscription limits and availability may apply.
- GitHub Actions CI runs independently after PR submission, subject to GitHub's own usage policies.
- GPT review is initiated by the Founder in ChatGPT; it is **not** automatically triggered by a GitHub webhook in this option.

## Security
Never put secrets in `VITE_*` variables intended for browser builds. See P0 Issue #2. Do not paste production credentials into AI prompts. Do not use permission-bypass flags.
