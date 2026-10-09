#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node -e 'if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("Reading Studio requires Node.js 24.x")'
if [[ -d /workspace && -w /workspace ]]; then
  reading_npm_cache=${READING_NPM_CACHE:-/workspace/.npm-cache}
else
  reading_npm_cache=${READING_NPM_CACHE:-$PWD/.runtime/npm-cache}
fi
npm ci --cache "$reading_npm_cache" --no-audit --no-fund
npm run build
npm run seed
