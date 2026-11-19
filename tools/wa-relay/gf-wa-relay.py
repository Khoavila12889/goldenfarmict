#!/usr/bin/env python3
"""gf-wa-relay — file -> ingest relay for the Hermes WhatsApp recorder.

The Hermes agent (profile gf-recorder) is a SILENT collector: for every
meeting-room record it extracts from the pilot WhatsApp group it writes ONE
JSON file into its workspace drop folder (wa-outbox/). This relay runs
OUTSIDE the agent (systemd timer, every minute, as root):

  1. scans wa-outbox/ for *.json files,
  2. POSTs each to the GoldenFarmICT ingest endpoint
     (POST /api/wa-records/ingest) with the X-Bot-Secret header read from
     /home/goldenfarmict/.env.wa (the secret is never logged or printed),
  3. on HTTP 200 moves the file to wa-outbox/sent/,
  4. on any failure leaves the file in place, logs the failure and retries
     on the next run; after MAX_ATTEMPTS failed attempts the file is moved
     to wa-outbox/failed/ for manual review (poison-file quarantine).

Contract: /home/goldenfarmict/docs/wa_ingest_contract.md
Log: /var/log/gf-wa-relay.log (self-rotates at ~5 MB, one generation kept).
State (attempt counters): /var/lib/gf-wa-relay/state.json
"""
import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.request

OUTBOX = "/home/hermes/.hermes/profiles/gf-recorder/workspace/wa-outbox"
SENT_DIR = os.path.join(OUTBOX, "sent")
FAILED_DIR = os.path.join(OUTBOX, "failed")
ENV_WA = "/home/goldenfarmict/.env.wa"
INGEST_URL = "http://localhost:8000/api/wa-records/ingest"
LOG_FILE = "/var/log/gf-wa-relay.log"
STATE_FILE = "/var/lib/gf-wa-relay/state.json"
MAX_ATTEMPTS = 10
HTTP_TIMEOUT = 20


def log(msg: str) -> None:
    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}"
    try:
        if os.path.exists(LOG_FILE) and os.path.getsize(LOG_FILE) > 5 * 1024 * 1024:
            os.replace(LOG_FILE, LOG_FILE + ".old")
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass
    print(line)


def load_secret() -> str:
    for raw in open(ENV_WA, encoding="utf-8"):
        if raw.startswith("WA_BOT_SECRET="):
            return raw.split("=", 1)[1].strip()
    return ""


def load_state() -> dict:
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save_state(state: dict) -> None:
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f)
    os.replace(tmp, STATE_FILE)


def post_record(secret: str, payload: dict) -> tuple[int, str]:
    req = urllib.request.Request(
        INGEST_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Bot-Secret": secret},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            body = json.loads(resp.read().decode("utf-8") or "{}")
            return resp.status, f"id={body.get('id')}"
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = (json.loads(e.read().decode("utf-8") or "{}") or {}).get("detail", "")
        except ValueError:
            pass
        return e.code, str(detail)[:200]
    except (urllib.error.URLError, OSError) as e:
        return 0, f"network error: {e}"


def main() -> int:
    if not os.path.isdir(OUTBOX):
        log(f"ERROR outbox missing: {OUTBOX}")
        return 0
    os.makedirs(SENT_DIR, exist_ok=True)
    os.makedirs(FAILED_DIR, exist_ok=True)

    secret = load_secret()
    if not secret:
        log("ERROR WA_BOT_SECRET not found in .env.wa — nothing sent")
        return 0

    state = load_state()
    files = sorted(f for f in os.listdir(OUTBOX) if f.endswith(".json"))
    if not files:
        return 0

    for name in files:
        path = os.path.join(OUTBOX, name)
        try:
            with open(path, encoding="utf-8") as f:
                payload = json.load(f)
            if not isinstance(payload, dict):
                raise ValueError("JSON root is not an object")
        except (OSError, ValueError) as e:
            attempts = state.get(name, 0) + 1
            state[name] = attempts
            log(f"FAIL {name}: unreadable JSON ({e}); attempt {attempts}/{MAX_ATTEMPTS}")
            if attempts >= MAX_ATTEMPTS:
                shutil.move(path, os.path.join(FAILED_DIR, name))
                state.pop(name, None)
                log(f"QUARANTINE {name} -> failed/ after {attempts} attempts")
            continue

        status, info = post_record(secret, payload)
        rtype = payload.get("record_type", "?")
        if status == 200:
            shutil.move(path, os.path.join(SENT_DIR, name))
            state.pop(name, None)
            log(f"OK {name} ({rtype}) -> ingest {info}; moved to sent/")
        else:
            attempts = state.get(name, 0) + 1
            state[name] = attempts
            log(f"FAIL {name} ({rtype}): HTTP {status} {info}; attempt {attempts}/{MAX_ATTEMPTS}")
            if attempts >= MAX_ATTEMPTS:
                shutil.move(path, os.path.join(FAILED_DIR, name))
                state.pop(name, None)
                log(f"QUARANTINE {name} -> failed/ after {attempts} attempts")

    save_state(state)
    return 0


if __name__ == "__main__":
    sys.exit(main())
