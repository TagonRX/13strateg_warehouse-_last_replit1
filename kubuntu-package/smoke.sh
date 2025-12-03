#!/usr/bin/env bash
set -euo pipefail

PORT=${1:-5000}
echo "== Smoke test on port $PORT =="

echo "Health:"
curl -s "http://localhost:$PORT/api/health" | jq || true

echo "Debug status:"
curl -s "http://localhost:$PORT/api/debug/status" | jq || true