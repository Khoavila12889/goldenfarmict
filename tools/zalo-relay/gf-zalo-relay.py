#!/usr/bin/env python3
"""gf-zalo-relay — file -> ingest relay for the Zalo announcement recorder.

The Zalo personal bot (/home/zalo-personal-bot, zca-js) has a PASSIVE
capture branch: for every formal announcement it classifies in the
allowlisted groups (ZALO_CAPTURE_GROUPS) it writes ONE JSON file into its
drop folder (zalo-outbox/). This relay runs OUTSIDE the bot (systemd
timer, every minute, as root):

  1. scans zalo-outbox/ for *.json files,
  2. POSTs each to the GoldenFarmICT ingest endpoint
     (POST /api/zalo-records/ingest) with the X-Bot-Secret header read from
     /home/goldenfarmict/.env.zalo (the secret is never logged or printed),
  3. on HTTP 200 moves the file to zalo-outbox/sent/ (the ingest is
     idempotent on msg_id, so a re-sent file returns duplicate=true and is
     still a success),
  4. on any failure leaves the file in place, logs the failure and retries
     on the next run; after MAX_ATTEMPTS failed attempts the file is moved
     to zalo-outbox/failed/ for manual review (poison-file quarantine) and
     a GF ALERT webhook is fired (shared config with the WhatsApp relay).

Contract: /home/goldenfarmict/docs/zalo_ingest_contract.md
Log: /var/log/gf-zalo-relay.log (self-rotates at ~5 MB, one generation kept).
State (attempt counters): /var/lib/gf-zalo-relay/state.json
"""
import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.request

OUTBOX = "/home/zalo-personal-bot/zalo-outbox"
SENT_DIR = os.path.join(OUTBOX, "sent")
FAILED_DIR = os.path.join(OUTBOX, "failed")
ENV_ZALO = "/home/goldenfarmict/.env.zalo"
INGEST_URL = "http://localhost:8000/api/zalo-records/ingest"
LOG_FILE = "/var/log/gf-zalo-relay.log"
STATE_FILE = "/var/lib/gf-zalo-relay/state.json"
MAX_ATTEMPTS = 10
HTTP_TIMEOUT = 20
# GF ALERT: webhook alert when a file is quarantined into failed/.
# Shared config with the WhatsApp relay (root-owned, mode 600):
# /etc/gf-wa-relay-alert.conf
#   WEBHOOK_URL=   (empty = alert is only written to the relay log)
#   CHAT_ID=       (optional; included in the payload when set)
ALERT_CONF = "/etc/gf-wa-relay-alert.conf"
ALERT_TIMEOUT = 5


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
    for raw in open(ENV_ZALO, encoding="utf-8"):
        if raw.startswith("ZALO_BOT_SECRET="):
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
            info = f"id={body.get('id')}"
            if body.get("duplicate"):
                info += " duplicate"
            return resp.status, info
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = (json.loads(e.read().decode("utf-8") or "{}") or {}).get("detail", "")
        except ValueError:
            pass
        return e.code, str(detail)[:200]
    except (urllib.error.URLError, OSError) as e:
        return 0, f"network error: {e}"


# GF ALERT: load the alert webhook config (key=value lines).
def load_alert_conf() -> dict:
    conf = {}
    try:
        with open(ALERT_CONF, encoding="utf-8") as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                conf[key.strip()] = value.strip()
    except OSError:
        pass
    return conf


# GF ALERT: fire ONE webhook POST for a file just moved into failed/.
# Telegram-bot-API-compatible JSON payload. Never raises: any alert
# error is caught and written to the relay log instead.
def send_failed_alert(filename: str) -> None:
    try:
        conf = load_alert_conf()
        url = conf.get("WEBHOOK_URL", "")
        if not url:
            log(f"ALERT (chua cau hinh webhook): {filename}")
            return
        payload = {
            "text": f"Báo động: Có bản ghi Zalo bị kẹt tại thư mục failed: {filename}"
        }
        chat_id = conf.get("CHAT_ID", "")
        if chat_id:
            payload["chat_id"] = chat_id
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=ALERT_TIMEOUT) as resp:
            log(f"ALERT sent for {filename} (webhook HTTP {resp.status})")
    except Exception as e:  # alerting must never break the relay run
        log(f"ALERT failed for {filename}: {e}")


def main() -> int:
    if not os.path.isdir(OUTBOX):
        log(f"ERROR outbox missing: {OUTBOX}")
        return 0
    os.makedirs(SENT_DIR, exist_ok=True)
    os.makedirs(FAILED_DIR, exist_ok=True)

    secret = load_secret()
    if not secret:
        log("ERROR ZALO_BOT_SECRET not found in .env.zalo — nothing sent")
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
                send_failed_alert(name)  # GF ALERT
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
                send_failed_alert(name)  # GF ALERT

    save_state(state)
    return 0


if __name__ == "__main__":
    sys.exit(main())
