#!/bin/bash
# Submit dsh-ungrouped-sweeper to awesome-dsh-plugin via PR.
# Scheduled 2026-11-13 13:30 CST — the repo crosses the 1-day-age gate at 10:20.
set -euo pipefail
export HTTPS_PROXY=http://192.168.2.153:16492 HTTP_PROXY=http://192.168.2.153:16492
WORK=/data/tmp/opencode/awesome-pr
LOG=/data/tmp/opencode/awesome-pr.log
exec >> "$LOG" 2>&1
echo "=== PR submission run at $(date -Is) ==="

cd "$WORK/awesome-dsh-plugin"

# Idempotency: skip if a PR for this file is already open.
if gh pr list --search "dsh-ungrouped-sweeper in:title" --state open --json number -q 'length' | grep -qv '^0$'; then
  echo "PR already open, nothing to do"; exit 0
fi

git -c http.proxy=socks5://192.168.2.153:16492 fetch origin main --quiet || git fetch origin main --quiet
git checkout main --quiet
git -c http.proxy=socks5://192.168.2.153:16492 pull --ff-only origin main --quiet || git pull --ff-only origin main --quiet
BRANCH="add-dsh-ungrouped-sweeper"
git branch -D "$BRANCH" 2>/dev/null || true
git checkout -b "$BRANCH" --quiet
cp /home/doro/dsh-ungrouped-sweeper/market/pr-data/dororo42__dsh-ungrouped-sweeper.yml data/plugins/
git add data/plugins/dororo42__dsh-ungrouped-sweeper.yml
git commit -q -m "Add dsh-ungrouped-sweeper (session)"
export GITHUB_TOKEN=$(gh auth token)
if ! node scripts/check-submission.mjs --base "$(git rev-parse origin/main)" --pr-created "$(date -u +%Y-%m-%dT%H:%M:%SZ)"; then echo "check-submission FAILED — aborting"; exit 1; fi
git -c http.proxy=socks5://192.168.2.153:16492 push -q -u origin "$BRANCH" || git push -q -u origin "$BRANCH"
gh pr create \
  --repo awesome-dsh-plugin/awesome-dsh-plugin \
  --title "Add dsh-ungrouped-sweeper (session)" \
  --body-file /home/doro/dsh-ungrouped-sweeper/market/pr-body.md
echo "PR created OK at $(date -Is)"
