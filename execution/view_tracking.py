#!/usr/bin/env python3
"""
Deterministic CLI viewer & cleaner for visitor tracking telemetry (../.tmp/journey_events.jsonl).

Usage:
  .venv/bin/python execution/view_tracking.py                # View real visitor tracking grouped by device
  .venv/bin/python execution/view_tracking.py --no-preview   # Exclude ?preview=1 creator sessions
  .venv/bin/python execution/view_tracking.py --prune-tests  # Remove synthetic automated test-suite bloat
"""

import argparse
from datetime import datetime
import json
from pathlib import Path
from typing import Dict, List

ROOT_DIR = Path(__file__).resolve().parent.parent
EVENTS_LOG = ROOT_DIR / ".tmp" / "journey_events.jsonl"

SYNTHETIC_PREFIXES = (
    "scenario",
    "e2e_verify",
    "combo_test",
    "oversized_test",
    "adv_",
    "test_",
)


def is_synthetic_event(ev: dict) -> bool:
    sid = str(ev.get("sessionId") or "").strip()
    if not sid:
        return True
    low = sid.lower()
    if low == "test":
        return True
    return any(low.startswith(p) for p in SYNTHETIC_PREFIXES)


def fmt_dur(ms_val) -> str:
    try:
        sec = max(0, int(round(float(ms_val or 0) / 1000.0)))
    except (ValueError, TypeError):
        sec = 0
    if sec < 60:
        return f"{sec}s"
    mins, rem = divmod(sec, 60)
    return f"{mins}m {rem:02d}s"


def parse_iso_ms(ts_str: str) -> float:
    if not ts_str:
        return 0.0
    try:
        cleaned = ts_str.replace("Z", "+00:00")
        return datetime.fromisoformat(cleaned).timestamp() * 1000.0
    except Exception:
        return 0.0


def fmt_ts(ts_str: str) -> str:
    if not ts_str:
        return "—"
    try:
        cleaned = ts_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(cleaned).astimezone()
        return dt.strftime("%Y-%m-%d %H:%M:%S %Z")
    except Exception:
        return ts_str


def resolve_location(events: List[dict]) -> str:
    city = region = country = tz = ip = ""
    for ev in events:
        loc = ev.get("location") if isinstance(ev.get("location"), dict) else {}
        srv = ev.get("_server") if isinstance(ev.get("_server"), dict) else {}
        srv_geo = srv.get("geo") if isinstance(srv.get("geo"), dict) else {}

        city = loc.get("city") or city or srv_geo.get("city") or ""
        region = loc.get("region") or region or srv_geo.get("region") or ""
        country = loc.get("country") or country or srv_geo.get("country") or ""
        tz = loc.get("timezone") or tz or srv_geo.get("timezone") or ""
        if loc.get("ip"):
            ip = loc["ip"]
        elif srv.get("ip") and srv.get("ip") not in ("127.0.0.1", "::1"):
            ip = srv["ip"]

    parts = []
    for p in (city, region, country):
        if p and p not in parts:
            parts.append(p)
    base = ", ".join(parts) if parts else (tz or "Local / Unresolved")
    if parts and tz:
        base = f"{base} ({tz})"
    if ip:
        base = f"{base} [IP: {ip}]"
    return base


def prune_synthetic_events() -> int:
    if not EVENTS_LOG.exists():
        return 0
    kept = []
    removed = 0
    for line in EVENTS_LOG.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            removed += 1
            continue
        if not isinstance(obj, dict) or is_synthetic_event(obj):
            removed += 1
            continue
        kept.append(json.dumps(obj, ensure_ascii=False))
    EVENTS_LOG.write_text("\n".join(kept) + ("\n" if kept else ""), encoding="utf-8")
    return removed


def main() -> None:
    parser = argparse.ArgumentParser(description="View Contact Sheet visitor tracking report.")
    parser.add_argument(
        "--no-preview",
        action="store_true",
        help="Exclude ?preview=1 creator sessions.",
    )
    parser.add_argument(
        "--prune-tests",
        action="store_true",
        help="Remove synthetic E2E test-runner rows from .tmp/journey_events.jsonl.",
    )
    parser.add_argument(
        "--include-legacy",
        action="store_true",
        help="Include older v1 dev sessions recorded before v2 multi-device tracking.",
    )
    parser.add_argument(
        "--reset-all",
        action="store_true",
        help="Clear all logged events in .tmp/journey_events.jsonl (for a clean slate before sharing).",
    )
    args = parser.parse_args()

    if args.reset_all:
        EVENTS_LOG.parent.mkdir(parents=True, exist_ok=True)
        EVENTS_LOG.write_text("", encoding="utf-8")
        print(f"[reset] Cleared {EVENTS_LOG} — ready for a fresh start.")
        return

    if args.prune_tests:
        removed_count = prune_synthetic_events()
        print(f"[clean] Pruned {removed_count} synthetic test rows from {EVENTS_LOG}")

    if not EVENTS_LOG.exists():
        print("No tracking events recorded yet.")
        return

    raw_events: List[dict] = []
    for line in EVENTS_LOG.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(ev, dict) or is_synthetic_event(ev):
            continue
        raw_events.append(ev)

    has_v2 = any(e.get("schemaVersion") == 2 for e in raw_events)
    events = [
        ev
        for ev in raw_events
        if (args.include_legacy or not has_v2 or ev.get("schemaVersion") == 2)
        and not (args.no_preview and ev.get("isPreview") is True)
    ]

    if not events:
        print("No visitor events match the filter yet.")
        return

    devices: Dict[str, List[dict]] = {}
    for ev in events:
        did = str(ev.get("deviceId") or f"legacy_{ev.get('sessionId')}")
        devices.setdefault(did, []).append(ev)

    print("=" * 78)
    print(f"VISITOR TRACKING REPORT — {len(devices)} UNIQUE DEVICE(S)")
    print("=" * 78)

    for d_idx, (did, dev_events) in enumerate(devices.items(), start=1):
        dev_events.sort(key=lambda e: parse_iso_ms(str(e.get("ts") or "")))
        dev_meta = {}
        for ev in reversed(dev_events):
            if isinstance(ev.get("device"), dict) and ev["device"].get("label"):
                dev_meta = ev["device"]
                break

        dev_label = dev_meta.get("label") or "Legacy Browser Session"
        loc_str = resolve_location(dev_events)

        sessions: Dict[str, List[dict]] = {}
        for ev in dev_events:
            sid = str(ev.get("sessionId") or "unknown")
            sessions.setdefault(sid, []).append(ev)

        print(f"\n[DEVICE #{d_idx}] {dev_label}  (id: {did})")
        print(f"  General Location : {loc_str}")
        if dev_meta.get("screen"):
            print(
                f"  Screen / Lang    : {dev_meta.get('screen')} · {dev_meta.get('language') or '—'}"
            )

        for s_idx, (sid, s_evs) in enumerate(sessions.items(), start=1):
            s_evs.sort(key=lambda e: parse_iso_ms(str(e.get("ts") or "")))
            first_ev = s_evs[0]
            last_ev = s_evs[-1]
            opened_ev = next((e for e in s_evs if e.get("event") == "page_opened"), first_ev)
            start_ev = next((e for e in s_evs if e.get("event") == "started_journey"), None)
            signed_ev = next(
                (e for e in reversed(s_evs) if e.get("event") == "signed_contract"), None
            )
            ig_ev = next(
                (
                    e
                    for e in s_evs
                    if e.get("event") in ("clicked_instagram_send", "clicked_whatsapp_send")
                ),
                None,
            )

            max_active = max((float(e.get("activeTimeMs") or 0) for e in s_evs), default=0.0)
            wall_ms = max(
                0.0,
                parse_iso_ms(str(last_ev.get("ts") or ""))
                - parse_iso_ms(str(first_ev.get("ts") or "")),
            )
            effective_ms = max_active if max_active > 0 else wall_ms

            protest_count = 0
            clause_toggles = []
            act2_cards = []
            custom_rule = ""

            for e in s_evs:
                d = e.get("data") if isinstance(e.get("data"), dict) else {}
                ev_name = e.get("event")
                if ev_name == "clicked_hate_video_calls":
                    protest_count = max(protest_count + 1, int(d.get("protestCount") or 1))
                elif ev_name == "unlocked_observation":
                    act2_cards.append(str(d.get("cardTitle") or d.get("cardId") or "card"))
                elif ev_name == "toggled_clause":
                    mark = "Checked" if d.get("checked") else "Unchecked"
                    title = d.get("clauseTitle") or d.get("clauseId")
                    clause_toggles.append(f"{mark} '{title}'")
                elif ev_name == "custom_rule_typed" and d.get("customNote"):
                    custom_rule = str(d["customNote"])
                elif ev_name == "signed_contract":
                    if d.get("customNote"):
                        custom_rule = str(d["customNote"])
                    if d.get("protestCount") is not None:
                        protest_count = max(protest_count, int(d.get("protestCount") or 0))

            preview_tag = " [?preview=1]" if any(e.get("isPreview") for e in s_evs) else ""
            print(f"\n  --- Session #{s_idx}: {sid}{preview_tag} ---")
            print(f"  Opened Quiz      : {fmt_ts(str(opened_ev.get('ts') or ''))}")
            if start_ev:
                s_data = start_ev.get("data") if isinstance(start_ev.get("data"), dict) else {}
                hes = s_data.get("hesitationMs")
                hes_note = f" (after {fmt_dur(hes)})" if hes is not None else ""
                print(
                    f"  First Button     : {fmt_ts(str(start_ev.get('ts') or ''))}{hes_note}"
                )
            else:
                print("  First Button     : Not pressed yet")

            print(
                f"  Time Spent       : {fmt_dur(effective_ms)} active  ({fmt_dur(wall_ms)} wall span)"
            )
            print(f"  'No' Clicks      : {protest_count}x ('Urăsc literalmente apelurile video')")
            print(
                f"  Act 2 Circled    : {' -> '.join(act2_cards) if act2_cards else 'None'}"
            )
            print(
                f"  T&C Clicks       : {', '.join(clause_toggles) if clause_toggles else 'None'}"
            )
            if signed_ev:
                sd = signed_ev.get("data") if isinstance(signed_ev.get("data"), dict) else {}
                clauses = sd.get("clauseTitles") or sd.get("clauses") or []
                print(f"  Signed Clauses   : {clauses}")
            if custom_rule:
                print(f"  Custom Rule      : {custom_rule}")
            if ig_ev:
                print(f"  Instagram Send   : Clicked at {fmt_ts(str(ig_ev.get('ts') or ''))}")

            print("  Steps & Timestamps:")
            for e in s_evs:
                ev_name = str(e.get("event") or "")
                if ev_name in ("time_heartbeat", "location_resolved"):
                    continue
                d = e.get("data") if isinstance(e.get("data"), dict) else {}
                if ev_name == "step_viewed":
                    lbl = d.get("stepLabel") or d.get("stepKey") or f"slide {d.get('slideIdx')}"
                    prev_dur = d.get("prevStepDurationMs")
                    dur_suffix = f" (prev step: {fmt_dur(prev_dur)})" if prev_dur else ""
                    print(f"    • {fmt_ts(str(e.get('ts') or ''))} -> {lbl}{dur_suffix}")
                else:
                    print(f"    • {fmt_ts(str(e.get('ts') or ''))} -> [{ev_name}]")


if __name__ == "__main__":
    main()
