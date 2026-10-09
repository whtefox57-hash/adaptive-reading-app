#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source .devcontainer/origin.sh
bash scripts/start.sh
