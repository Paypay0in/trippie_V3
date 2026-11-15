#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! "$1" =~ ^[0-9]+$ ]]; then
  echo "Usage: bash scripts/start-claude-task.sh <issue-number>" >&2
  exit 2
fi

issue="$1"
for cmd in git gh claude npm; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing command: $cmd" >&2
    exit 1
  fi
done

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash changes first." >&2
  exit 1
fi

repo="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
if [[ "$repo" != "Paypay0in/trippie_V3" ]]; then
  echo "Wrong repository: $repo" >&2
  exit 1
fi

title="$(gh issue view "$issue" --json title --jq '.title')"
slug="$(printf '%s' "$title" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' | cut -c1-45)"
if [[ -z "$slug" ]]; then slug="task"; fi
branch="ai/issue-${issue}-${slug}"

git fetch origin main
git switch main
git pull --ff-only origin main
if git show-ref --verify --quiet "refs/heads/$branch"; then
  git switch "$branch"
else
  git switch -c "$branch"
fi

echo
echo "Issue #$issue: $title"
echo "Branch: $branch"
echo "Claude Code will run interactively using your own login."
echo "Review the issue and approve scope before requesting edits."
echo
gh issue view "$issue"
claude

echo
echo "Claude session ended. Review changes and run:"
echo "  npm run lint && npm run build"
echo "  git status"
echo "When ready, commit and push your branch, then open a DRAFT PR:"
echo "  gh pr create --draft --base main --fill"
echo "Do not merge or deploy without Founder approval."
