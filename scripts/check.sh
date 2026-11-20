#!/usr/bin/env bash
# Pre-deploy gate. Run from the project root; exits non-zero on the first
# failure so a broken build never reaches the running container.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "==> typecheck"
npx tsc --noEmit

echo "==> lint"
npm run lint

echo "==> unit tests"
npm test

echo "==> production build"
npm run build

echo "==> all checks passed"
