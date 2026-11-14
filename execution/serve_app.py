#!/usr/bin/env python3
"""
Deterministic server for the Contact Sheet · Istanbul Interactive Journey app.
- Serves static frontend from ../app/ (including live tracking dashboard at /stats or /stats.html)
- Logs all visitor telemetry (multi-device, passive general location, timestamps, clicks, time spent)
  to ../.tmp/journey_events.jsonl
- Sends optional instant Telegram notifications when TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID
  are configured in ../.env
"""

from datetime import datetime, timezone
import ipaddress
import json
import mimetypes
import os
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

mimetypes.add_type("audio/mp4", ".m4a")
mimetypes.add_type("audio/mpeg", ".mp3")

ROOT_DIR = Path(__file__).resolve().parent.parent
APP_DIR = ROOT_DIR / "app"
TMP_DIR = ROOT_DIR / ".tmp"
EVENTS_LOG = Path(os.environ.get("JOURNEY_EVENTS_LOG", str(TMP_DIR / "journey_events.jsonl")))
ENV_FILE = ROOT_DIR / ".env"

_IP_GEO_CACHE = {}

SYNTHETIC_SESSION_PREFIXES = (
    "scenario",
    "e2e_verify",
    "combo_test",
    "oversized_test",
    "adv_",
    "test_",
)


def is_synthetic_session(session_id: str) -> bool:
    sid = (session_id or "").strip()
    if not sid:
        return True
    lower = sid.lower()
    if lower == "test":
        return True
    return any(lower.startswith(pref) for pref in SYNTHETIC_SESSION_PREFIXES)


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def send_telegram_alert(text: str) -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat_id:
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = urllib.parse.urlencode({"chat_id": chat_id, "text": text}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=5) as _:
            pass
    except Exception as exc:
        print(f"[telegram] Failed to send notification: {exc}")


def is_public_ip(ip_str: str) -> bool:
    if not ip_str:
        return False
    try:
        addr = ipaddress.ip_address(ip_str)
        return not (
            addr.is_private
            or addr.is_loopback
            or addr.is_link_local
            or addr.is_multicast
            or addr.is_reserved
        )
    except ValueError:
        return False


def lookup_ip_geo(ip_str: str) -> dict:
    if not is_public_ip(ip_str):
        return {"city": "", "region": "", "country": "", "source": "local_network"}
    if ip_str in _IP_GEO_CACHE:
        return _IP_GEO_CACHE[ip_str]
    geo = {"city": "", "region": "", "country": "", "source": "ip"}
    try:
        url = f"https://ipwho.is/{urllib.parse.quote(ip_str)}"
        req = urllib.request.Request(url, headers={"User-Agent": "PlyJourneyTracker/1.0"})
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            body = json.loads(resp.read().decode("utf-8", errors="replace"))
            if isinstance(body, dict) and body.get("success") is not False:
                geo = {
                    "city": str(body.get("city") or ""),
                    "region": str(body.get("region") or ""),
                    "country": str(body.get("country") or ""),
                    "countryCode": str(body.get("country_code") or ""),
                    "timezone": str((body.get("timezone") or {}).get("id") or ""),
                    "source": "server_ipwho",
                }
    except Exception:
        pass
    if len(_IP_GEO_CACHE) < 512:
        _IP_GEO_CACHE[ip_str] = geo
    return geo


def extract_request_meta(handler: SimpleHTTPRequestHandler) -> dict:
    headers = handler.headers
    ip_candidates = [
        headers.get("CF-Connecting-IP", ""),
        headers.get("True-Client-IP", ""),
        (headers.get("X-Forwarded-For", "").split(",")[0] if headers.get("X-Forwarded-For") else ""),
        headers.get("X-Real-IP", ""),
        headers.get("Fly-Client-IP", ""),
    ]
    client_ip = next((c.strip() for c in ip_candidates if c and c.strip()), "")
    if not client_ip and handler.client_address:
        client_ip = str(handler.client_address[0])

    edge_city = (
        headers.get("CF-IPCity")
        or headers.get("X-Vercel-IP-City")
        or headers.get("X-AppEngine-City")
        or ""
    ).strip()
    edge_region = (
        headers.get("CF-Region")
        or headers.get("X-Vercel-IP-Country-Region")
        or headers.get("X-AppEngine-Region")
        or ""
    ).strip()
    edge_country = (
        headers.get("CF-IPCountry")
        or headers.get("X-Vercel-IP-Country")
        or headers.get("X-AppEngine-Country")
        or ""
    ).strip()

    if edge_city or edge_country:
        geo = {
            "city": urllib.parse.unquote(edge_city),
            "region": urllib.parse.unquote(edge_region),
            "country": edge_country,
            "source": "edge_headers",
        }
    else:
        geo = lookup_ip_geo(client_ip)

    return {
        "serverTs": datetime.now(timezone.utc).isoformat(),
        "ip": client_ip,
        "userAgent": (headers.get("User-Agent") or "")[:280],
        "geo": geo,
    }


def format_visitor_tag(payload: dict) -> str:
    dev = payload.get("device") if isinstance(payload.get("device"), dict) else {}
    loc = payload.get("location") if isinstance(payload.get("location"), dict) else {}
    srv = payload.get("_server") if isinstance(payload.get("_server"), dict) else {}
    srv_geo = srv.get("geo") if isinstance(srv.get("geo"), dict) else {}

    dev_label = dev.get("label") or "Unknown Device"
    city = loc.get("city") or srv_geo.get("city") or ""
    country = loc.get("country") or srv_geo.get("country") or ""
    tz = loc.get("timezone") or srv_geo.get("timezone") or ""
    loc_parts = [p for p in (city, country) if p]
    loc_str = ", ".join(loc_parts) if loc_parts else (tz or "Unknown Location")
    return f"{dev_label} · {loc_str}"


class JourneyHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        super().end_headers()

    def do_GET(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path in ("/stats", "/stats/"):
                self.path = "/stats.html" + (f"?{parsed.query}" if parsed.query else "")
                return super().do_GET()

            if parsed.path == "/api/events":
                TMP_DIR.mkdir(parents=True, exist_ok=True)
                qs = urllib.parse.parse_qs(parsed.query)
                only_real = qs.get("real", ["0"])[0] == "1"
                rows = []
                if EVENTS_LOG.exists():
                    for line in EVENTS_LOG.read_text(encoding="utf-8", errors="replace").splitlines():
                        if not line.strip():
                            continue
                        try:
                            item = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        if only_real and isinstance(item, dict):
                            sid = str(item.get("sessionId") or "")
                            if is_synthetic_session(sid):
                                continue
                        rows.append(item)
                body = json.dumps({"count": len(rows), "events": rows}, indent=2).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            return super().do_GET()
        except Exception as exc:
            try:
                self.send_error(500, f"Internal Server Error: {exc}")
            except Exception:
                pass

    def do_POST(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path != "/api/event":
                self.send_error(404, "Not Found")
                return

            length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(length).decode("utf-8", errors="replace")
            try:
                payload = json.loads(raw_body)
            except json.JSONDecodeError:
                self.send_error(400, "Invalid JSON")
                return

            if not isinstance(payload, dict):
                self.send_error(400, "Payload must be a JSON object")
                return

            payload["_server"] = extract_request_meta(self)

            TMP_DIR.mkdir(parents=True, exist_ok=True)
            with open(EVENTS_LOG, "a", encoding="utf-8") as f:
                f.write(json.dumps(payload, ensure_ascii=False) + "\n")

            raw_ev = payload.get("event")
            ev_name = str(raw_ev).strip() if isinstance(raw_ev, str) else ""
            sid_val = str(payload.get("sessionId") or "")

            raw_data = payload.get("data")
            if not isinstance(raw_data, dict):
                raw_data = payload.get("payload")
            data = raw_data if isinstance(raw_data, dict) else {}

            if not is_synthetic_session(sid_val):
                visitor_tag = format_visitor_tag(payload)
                active_sec = round(float(payload.get("activeTimeMs") or 0) / 1000.0, 1)

                if ev_name == "page_opened":
                    send_telegram_alert(f"📍 Link opened!\nDevice: {visitor_tag}")
                elif ev_name == "started_journey":
                    hes_s = round(float(data.get("hesitationMs") or 0) / 1000.0, 1)
                    send_telegram_alert(
                        f"👀 Pressed 'Începe' after {hes_s}s!\nDevice: {visitor_tag}"
                    )
                elif ev_name == "toggled_clause":
                    action = "Checked" if data.get("checked") else "Unchecked"
                    title = data.get("clauseTitle") or data.get("clauseId") or "clause"
                    send_telegram_alert(f"✏️ {action} T&C: {title}\n({visitor_tag})")
                elif ev_name == "clicked_hate_video_calls":
                    raw_protest = data.get("protestCount")
                    try:
                        protests = int(raw_protest) if raw_protest is not None else 1
                    except (ValueError, TypeError):
                        protests = 1
                    send_telegram_alert(
                        f"😂 Clicked 'Urăsc literalmente apelurile video' (#{protests})\n({visitor_tag})"
                    )
                elif ev_name == "signed_contract":
                    raw_clauses = data.get("clauses")
                    if raw_clauses is None:
                        raw_clauses = data.get("selected_clauses")
                    if isinstance(raw_clauses, list):
                        clauses_list = [
                            str(c).strip() for c in raw_clauses if c is not None and str(c).strip()
                        ]
                    elif isinstance(raw_clauses, str) and raw_clauses.strip():
                        clauses_list = [raw_clauses.strip()]
                    else:
                        clauses_list = []
                    clauses_str = (
                        "\n".join(f"• {c}" for c in clauses_list)
                        if clauses_list
                        else "• (None specified)"
                    )

                    raw_note = data.get("customNote")
                    if raw_note is None:
                        raw_note = data.get("note")
                    if isinstance(raw_note, str) and raw_note.strip():
                        note_str = raw_note.strip()
                    elif raw_note is not None and not isinstance(raw_note, (dict, list)):
                        note_str = str(raw_note).strip() or "None"
                    else:
                        note_str = "None"

                    raw_protest = data.get("protestCount")
                    try:
                        protests = int(raw_protest) if raw_protest is not None else 0
                    except (ValueError, TypeError):
                        protests = 0

                    msg = (
                        f"✅ TREATY SIGNED!\n"
                        f"Device: {visitor_tag}\n"
                        f"Active time: {active_sec}s\n\n"
                        f"Terms selected:\n{clauses_str}\n\n"
                        f"Custom rule: {note_str}\n"
                        f"Protest ('No') clicks: {protests}"
                    )
                    send_telegram_alert(msg)
                elif ev_name in (
                    "clicked_instagram_send",
                    "clicked_whatsapp_send",
                    "whatsapp_opened",
                ):
                    send_telegram_alert(
                        f"💬 Clicked 'Trimite Verdictul pe Instagram'!\n({visitor_tag} · {active_sec}s)"
                    )

            resp = b'{"ok":true}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(resp)))
            self.end_headers()
            self.wfile.write(resp)
        except Exception as exc:
            try:
                self.send_error(500, f"Internal Server Error: {exc}")
            except Exception:
                pass


def main():
    load_dotenv(ENV_FILE)
    host = os.environ.get("HOST", "0.0.0.0" if os.environ.get("RENDER") else "127.0.0.1")
    port = int(os.environ.get("PORT", "8765"))
    server = ThreadingHTTPServer((host, port), JourneyHandler)
    print(f"Journey server running at http://{host}:{port}")
    print(f"Creator preview (with jump controls): http://{host}:{port}/?preview=1")
    print(f"Visitor Tracking Dashboard: http://{host}:{port}/stats.html")
    server.serve_forever()


if __name__ == "__main__":
    main()
