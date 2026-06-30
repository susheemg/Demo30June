"""
AI call ledger + budget caps (Pass 2 governance).

Privacy-first by design: the ledger stores ONLY metadata (provider, model, domain,
timing, sizes, success/error) — never prompt or response content — so no PII can
leak into it. Error strings are redacted as defence-in-depth.
"""
from __future__ import annotations

import re
import time
from typing import Optional

from sqlalchemy import text as _sql

_REDACT = [
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "<email>"),
    (re.compile(r"\b(?:\d[ -]?){13,19}\b"), "<number>"),
    (re.compile(r"\b[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]\b", re.I), "<nino>"),
    (re.compile(r"\+?\d[\d ()-]{8,}\d"), "<phone>"),
]


def redact(text: str) -> str:
    out = text or ""
    for rx, repl in _REDACT:
        out = rx.sub(repl, out)
    return out


def ensure_table(s) -> None:
    s.execute(_sql(
        "CREATE TABLE IF NOT EXISTS ai_call_log ("
        "id INTEGER PRIMARY KEY, ts TEXT, provider TEXT, model TEXT, domain TEXT, "
        "web_search INTEGER, duration_ms INTEGER, prompt_chars INTEGER, "
        "response_chars INTEGER, success INTEGER, error TEXT)"))
    s.commit()


def safe_record(session_factory, payload: dict) -> None:
    """Best-effort insert from the llm_config telemetry hook. Never raises."""
    try:
        with session_factory() as s:
            ensure_table(s)
            s.execute(_sql(
                "INSERT INTO ai_call_log (ts, provider, model, domain, web_search, "
                "duration_ms, prompt_chars, response_chars, success, error) "
                "VALUES (:ts,:p,:m,:d,:w,:dur,:pc,:rc,:ok,:err)"),
                {"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                 "p": payload.get("provider"), "m": payload.get("model"),
                 "d": payload.get("domain"), "w": 1 if payload.get("web_search") else 0,
                 "dur": payload.get("duration_ms"), "pc": payload.get("prompt_chars"),
                 "rc": payload.get("response_chars"),
                 "ok": 1 if payload.get("success") else 0,
                 "err": redact(str(payload.get("error") or ""))[:400] or None})
            s.commit()
    except Exception:
        pass


def today_count(s) -> int:
    day = time.strftime("%Y-%m-%d", time.gmtime())
    ensure_table(s)
    return int(s.execute(_sql(
        "SELECT COUNT(*) FROM ai_call_log WHERE ts LIKE :d"), {"d": day + "%"}).scalar() or 0)


def recent(s, n: int = 25) -> list:
    ensure_table(s)
    rows = s.execute(_sql(
        "SELECT ts, provider, model, domain, web_search, duration_ms, prompt_chars, "
        "response_chars, success, error FROM ai_call_log ORDER BY id DESC LIMIT :n"),
        {"n": n}).fetchall()
    keys = ["ts", "provider", "model", "domain", "web_search", "duration_ms",
            "prompt_chars", "response_chars", "success", "error"]
    return [dict(zip(keys, r)) for r in rows]


def get_budget(s) -> Optional[int]:
    from . import config_store as CFG
    b = CFG.get_json(s, "ai_budget", {}) or {}
    v = b.get("daily_calls")
    return int(v) if v is not None else None


def set_budget(s, daily_calls: Optional[int]) -> None:
    from . import config_store as CFG
    CFG.upsert_json(s, "ai_budget",
                    {"daily_calls": int(daily_calls)} if daily_calls is not None else {},
                    updated_by="admin", category="ai")
    s.commit()


def budget_check(session_factory):
    """Telemetry hook: (allowed, reason)."""
    try:
        with session_factory() as s:
            cap = get_budget(s)
            if cap is None:
                return True, ""
            used = today_count(s)
            if used >= cap:
                return False, f"daily cap {cap} reached ({used} calls today)"
            return True, ""
    except Exception:
        return True, ""
