#!/bin/bash
# Submit dsh-ungrouped-sweeper to awesome-dsh-plugin via PR.
# One-shot timer; idempotent (skips when an open PR already exists).
set -euo pipefail
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
WORK=/data/tmp/opencode/awesome-pr
LOG=/data/tmp/opencode/awesome-pr.log
exec >> "$LOG" 2>&1
echo "=== PR submission run at $(date -Is) ==="

# Proxy auto-probe: HTTP first, then socks5, then direct. Exported for both
# git (curl transport) and gh (Go transport understands socks5:// too).
if timeout 8 curl -sf -o /dev/null -x http://192.168.2.153:16492 https://github.com; then
  export HTTPS_PROXY=http://192.168.2.153:16492 HTTP_PROXY=http://192.168.2.153:16492
  echo "proxy: http://192.168.2.153:16492"
elif timeout 8 curl -sf -o /dev/null -x socks5://192.168.2.153:16492 https://github.com; then
  export HTTPS_PROXY=socks5://192.168.2.153:16492 HTTP_PROXY=socks5://192.168.2.153:16492
  echo "proxy: socks5://192.168.2.153:16492"
else
  unset HTTPS_PROXY HTTP_PROXY
  echo "proxy: none (direct)"
fi

cd "$WORK/awesome-dsh-plugin"

# Idempotency: skip if a PR for this file is already open.
if gh pr list --search "dsh-ungrouped-sweeper in:title" --state open --json number -q 'length' | grep -qv '^0$'; then
  echo "PR already open, nothing to do"; exit 0
fi

# Fresh main is mandatory: check-submission diffs against origin/main, and a
# stale base would count other people's new entries as ours.
git fetch --depth=1 origin main --quiet
git checkout main --quiet
git reset --hard origin/main --quiet
BRANCH="add-dsh-ungrouped-sweeper"
git branch -D "$BRANCH" 2>/dev/null || true
git checkout -b "$BRANCH" --quiet
cp /home/doro/dsh-ungrouped-sweeper/market/pr-data/dororo42__dsh-ungrouped-sweeper.yml data/plugins/
git add data/plugins/dororo42__dsh-ungrouped-sweeper.yml
git commit -q -m "Add dsh-ungrouped-sweeper (session)"
export GITHUB_TOKEN=$(gh auth token)
if ! node scripts/check-submission.mjs --base "$(git rev-parse origin/main)" --pr-created "$(date -u +%Y-%m-%dT%H:%M:%SZ)"; then echo "check-submission FAILED — aborting"; exit 1; fi
# Contributing requires a PR from a personal fork: push the branch to
# dororo42/awesome-dsh-plugin, then open the PR against upstream.
FORK_URL="https://github.com/dororo42/awesome-dsh-plugin.git"
git remote get-url fork >/dev/null 2>&1 || git remote add fork "$FORK_URL"
git push -q fork "$BRANCH"
gh pr create \
  --repo awesome-dsh-plugin/awesome-dsh-plugin \
  --head "dororo42:$BRANCH" \
  --title "Add dsh-ungrouped-sweeper (session)" \
  --body-file /home/doro/dsh-ungrouped-sweeper/market/pr-body.md
echo "PR created OK at $(date -Is)"
