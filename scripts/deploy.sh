#!/usr/bin/env bash
#
# One-command bootstrap: from a fresh clone (or fork) to a live, playable pool.
# Creates the GitHub repo if needed, enables Pages with the GitHub Actions
# source, and pushes — the build-and-deploy workflow does the rest.
#
# Requirements: gh (authenticated), git, node.
# Usage:
#   scripts/deploy.sh                      # use the existing 'origin' remote
#   scripts/deploy.sh <owner>/<repo>       # create that repo from this directory
#
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v gh >/dev/null 2>&1; then
  echo "error: the GitHub CLI 'gh' is required (https://cli.github.com/)." >&2
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "error: run 'gh auth login' first." >&2
  exit 1
fi

TARGET="${1:-}"

if [ -n "$TARGET" ]; then
  echo "==> Creating repository $TARGET from this directory"
  gh repo create "$TARGET" --public --source=. --remote=origin --push
  SLUG="$TARGET"
else
  if ! git remote get-url origin >/dev/null 2>&1; then
    echo "error: no 'origin' remote. Pass <owner>/<repo> to create one." >&2
    exit 1
  fi
  SLUG="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
  echo "==> Using existing repository $SLUG"
fi

OWNER="${SLUG%%/*}"
REPO="${SLUG##*/}"

echo "==> Sanity-checking the ledger before publishing"
npm ci
npm run verify:ledger

echo "==> Reminder: set REPO in app/src/config.ts to '$OWNER/$REPO' so writes target your repo"
grep -q "owner: \"$OWNER\"" app/src/config.ts || \
  echo "    (currently app/src/config.ts points elsewhere — edit and commit it)"

echo "==> Enabling GitHub Pages (source: GitHub Actions)"
# Idempotent: create the Pages site if it does not exist yet.
gh api -X POST "repos/$OWNER/$REPO/pages" \
  -f "build_type=workflow" >/dev/null 2>&1 || \
gh api -X PUT "repos/$OWNER/$REPO/pages" \
  -f "build_type=workflow" >/dev/null 2>&1 || \
  echo "    (Pages may already be enabled, or needs to be enabled in repo Settings → Pages)"

echo "==> Pushing main"
git push -u origin HEAD:main

echo ""
echo "Done. The build-and-deploy workflow will audit the ledger, rebuild state,"
echo "and publish to: https://$OWNER.github.io/$REPO/"
echo "Watch progress: gh run watch"
