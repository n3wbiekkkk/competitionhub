#!/usr/bin/env bash
# Re-runnable public-repo gate. Stage files first, then run this script.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
fail=0

report() {
  local label="$1"
  local output="$2"
  if [ -n "$output" ]; then
    printf 'FAIL %s\n%s\n' "$label" "$output"
    fail=1
  else
    printf 'PASS %s\n' "$label"
  fi
}

if git ls-files --cached --error-unmatch .env.local >/dev/null 2>&1; then
  echo "FAIL .env.local is staged"
  fail=1
else
  echo "PASS .env.local is not staged"
fi

report "no committed env values" "$(git grep --cached -n -E '(POSTGRES_PASSWORD|APP_DB_PASSWORD|SESSION_SECRET|CRON_SECRET|TYPHOON_API_KEY|DISCORD_WEBHOOK_URL)[[:space:]]*=.*[^[:space:]]' -- . ':!.env.example' | sed -E 's/(=).*/\1<REDACTED>/' || true)"

report "no personal/internal identifiers" "$(git grep --cached -n -E 'family-nas|newbie|sphetpitak|/Users/|192\.168\.|100\.7[0-9]\.|/opt/tech-competition-hub|tailscale|cloudflared' '--' . ':!tests/*' ':!scripts/audit-public-repo.sh' | head -30 || true)"

report "no credential token shapes" "$(git grep --cached -n -E '(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)' | head -20 || true)"

large=""
while IFS= read -r blob; do
  size=$(git cat-file -s "$blob" 2>/dev/null || echo 0)
  if [ "$size" -gt 2097152 ]; then
    large="$large $blob ($size bytes)"
  fi
done < <(git ls-files -s | awk '{print $2}')
report "no staged blob over 2 MiB" "$large"

if [ "$fail" -ne 0 ]; then
  echo "PUBLIC REPO GATE FAILED"
  exit 1
fi
echo "PUBLIC REPO GATE PASSED"
