#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .runtime
if [[ ! -f dist/index.html ]]; then
  echo 'Build missing. Run bash scripts/install.sh first.' >&2
  exit 1
fi
start_service() {
  local service_name="$1" service_entry="$2" service_pid service_args
  if [[ -f ".runtime/${service_name}.pid" ]]; then
    service_pid=$(cat ".runtime/${service_name}.pid")
    if [[ "$service_pid" =~ ^[0-9]+$ ]] && kill -0 "$service_pid" 2>/dev/null && [[ "$(ps -p "$service_pid" -o stat=)" != Z* ]]; then
      service_args=$(ps -p "$service_pid" -o args=)
      if [[ "$(ps -p "$service_pid" -o user= | tr -d ' ')" == "$(id -un)" && "$service_args" == *"$PWD/$service_entry"* ]]; then
        echo "$service_name already running"
        return
      fi
      echo "$service_name PID is occupied by another process; inspect before restarting." >&2
      exit 1
    fi
  fi
  NODE_USE_ENV_PROXY=1 NODE_ENV=production nohup node "$PWD/node_modules/tsx/dist/cli.mjs" "$PWD/$service_entry" < /dev/null > ".runtime/${service_name}.log" 2>&1 &
  echo "$!" > ".runtime/${service_name}.pid"
}
start_service server server/index.ts
start_service worker server/worker.ts
for attempt in $(seq 1 30); do
  if curl --silent --fail "http://127.0.0.1:${PORT:-3000}/api/health" | node -e 'let s="";process.stdin.on("data",b=>s+=b);process.stdin.on("end",()=>{try{const h=JSON.parse(s);process.exit(h.ok&&h.worker&&Date.now()-Date.parse(h.worker.heartbeat)<90000?0:1)}catch{process.exit(1)}})'; then
    echo 'Application and independent scheduler are ready.'
    exit 0
  fi
  sleep 1
done
echo 'Readiness failed. Inspect .runtime/server.log and .runtime/worker.log.' >&2
exit 1
