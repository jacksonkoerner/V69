#!/usr/bin/env bash
set -euo pipefail

# Query Supabase debug_logs for errors with surrounding context.
# Env vars:
#   SUPABASE_URL (default project URL)
#   SUPABASE_KEY (default parsed from js/config.js anon key)
#   DEVICE_ID (optional filter)
#   PAGE (optional filter)
#   LIMIT (default 10, for error mode)
# Usage:
#   scripts/check-errors.sh
#   DEVICE_ID=device-123 PAGE=index.html LIMIT=5 scripts/check-errors.sh
#   scripts/check-errors.sh --recent

DEFAULT_URL="https://bdqfpemylkqnmeqaoere.supabase.co"
CONFIG_FILE="js/config.js"

if [[ -f "$CONFIG_FILE" ]]; then
  DEFAULT_KEY="$(grep -E "SUPABASE_ANON_KEY\s*=\s*'[^']+'" "$CONFIG_FILE" | head -n1 | sed -E "s/.*'([^']+)'.*/\1/")"
else
  DEFAULT_KEY=""
fi

SUPABASE_URL="${SUPABASE_URL:-$DEFAULT_URL}"
SUPABASE_KEY="${SUPABASE_KEY:-$DEFAULT_KEY}"
LIMIT="${LIMIT:-10}"
DEVICE_ID="${DEVICE_ID:-}"
PAGE="${PAGE:-}"
MODE="errors"

if [[ "${1:-}" == "--recent" ]]; then
  MODE="recent"
fi

if [[ -z "$SUPABASE_KEY" ]]; then
  echo "ERROR: SUPABASE_KEY is empty and no default anon key was found in $CONFIG_FILE" >&2
  exit 1
fi

if ! [[ "$LIMIT" =~ ^[0-9]+$ ]]; then
  echo "ERROR: LIMIT must be a positive integer (got '$LIMIT')" >&2
  exit 1
fi

export SUPABASE_URL SUPABASE_KEY LIMIT DEVICE_ID PAGE MODE

python3 - <<'PY'
import json
import os
import subprocess
import sys
import urllib.parse

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
MODE = os.environ.get("MODE", "errors")
LIMIT = int(os.environ.get("LIMIT", "10"))
DEVICE_ID = os.environ.get("DEVICE_ID", "")
PAGE = os.environ.get("PAGE", "")

def q(v: str) -> str:
    return urllib.parse.quote(v, safe="")

def api_get(params: str):
    url = f"{SUPABASE_URL}/rest/v1/debug_logs?{params}"
    cmd = [
        "curl", "-sS", url,
        "-H", f"apikey: {SUPABASE_KEY}",
        "-H", f"Authorization: Bearer {SUPABASE_KEY}",
        "-H", "Accept: application/json",
    ]
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        print(f"ERROR: curl failed for {url}\n{p.stderr}", file=sys.stderr)
        sys.exit(2)
    body = p.stdout.strip()
    if not body:
        return []
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        print("ERROR: Supabase returned non-JSON response:", file=sys.stderr)
        print(body[:1000], file=sys.stderr)
        sys.exit(3)
    if isinstance(data, dict) and data.get("message"):
        print(f"ERROR: Supabase API error: {data.get('message')}", file=sys.stderr)
        sys.exit(4)
    if not isinstance(data, list):
        print("ERROR: Unexpected response format (expected JSON array).", file=sys.stderr)
        sys.exit(5)
    return data

def base_filters():
    parts = []
    if DEVICE_ID:
        parts.append(f"device_id=eq.{q(DEVICE_ID)}")
    if PAGE:
        parts.append(f"page=eq.{q(PAGE)}")
    return "&" + "&".join(parts) if parts else ""

def eq_or_null(col: str, val: str):
    if val is None or val == "":
        return f"{col}=is.null"
    return f"{col}=eq.{q(val)}"

def msg(m):
    if m is None:
        return ""
    s = str(m).replace("\n", "\\n")
    return s if len(s) <= 220 else s[:217] + "..."

def print_row(row, prefix="   "):
    level = str(row.get("level", "")).upper()
    created = row.get("created_at", "")
    message = msg(row.get("message", ""))
    print(f"{prefix}[{level:<5}] {created} | {message}")

filters = base_filters()
common_select = "select=created_at,level,message,device_id,page"

if MODE == "recent":
    params = (
        f"{common_select}"
        f"&level=in.(warn,error)"
        f"&order=created_at.desc"
        f"&limit=20"
        f"{filters}"
    )
    rows = api_get(params)
    print("Recent warn+error logs (latest 20):")
    print(f"Filters: DEVICE_ID={DEVICE_ID or '*'} PAGE={PAGE or '*'}")
    if not rows:
        print("No warn/error rows found.")
        sys.exit(0)
    for r in rows:
        print_row(r)
    sys.exit(0)

params = (
    f"{common_select}"
    f"&level=eq.error"
    f"&order=created_at.desc"
    f"&limit={LIMIT}"
    f"{filters}"
)
errors = api_get(params)

print(f"Error logs (latest {LIMIT}) with context window ±5 rows")
print(f"Filters: DEVICE_ID={DEVICE_ID or '*'} PAGE={PAGE or '*'}")

if not errors:
    print("No error rows found.")
    sys.exit(0)

for i, err in enumerate(errors, start=1):
    created_at = err.get("created_at", "")
    device_id = err.get("device_id", "") or "(null)"
    page = err.get("page", "") or "(null)"

    before_q = (
        f"{common_select}"
        f"&{eq_or_null('device_id', err.get('device_id', ''))}"
        f"&{eq_or_null('page', err.get('page', ''))}"
        f"&created_at=lt.{q(created_at)}"
        f"&order=created_at.desc"
        f"&limit=5"
    )
    after_q = (
        f"{common_select}"
        f"&{eq_or_null('device_id', err.get('device_id', ''))}"
        f"&{eq_or_null('page', err.get('page', ''))}"
        f"&created_at=gt.{q(created_at)}"
        f"&order=created_at.asc"
        f"&limit=5"
    )

    before = api_get(before_q)
    after = api_get(after_q)

    print("=" * 90)
    print(f"Error #{i} | device_id={device_id} | page={page} | created_at={created_at}")
    print("--- context (oldest -> newest) ---")

    for row in reversed(before):
        print_row(row)

    print_row(err, prefix=">>> ")

    for row in after:
        print_row(row)

print("=" * 90)
PY
