"""
Entity resolution + live financial research for the analysis sections.

resolve_entity() lets every analysis section (FDD, Reputation, Monitoring,
Contracts) target either a REGISTERED vendor (by Vendor ID or name) or an
unregistered entity typed into an "Other" free-text field. Outputs always carry
{vendor_id, vendor_name} so results link back to the register where possible.

research_financials() performs authoritative web research for published
financials when a live LLM key is configured; otherwise it returns a clear
"manual entry required" result so the deterministic engine still runs offline.
"""
from __future__ import annotations

import json
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .registry_models import VendorRecord


def resolve_entity(s: Session, *, vendor_id: Optional[str] = None,
                   other_name: Optional[str] = None) -> dict:
    """Resolve to {vendor_id, vendor_name, registered}.
    Priority: explicit vendor_id -> match by name -> 'Other' free text."""
    if vendor_id:
        v = s.scalars(select(VendorRecord).where(VendorRecord.vendor_id == vendor_id)).first()
        if v:
            return {"vendor_id": v.vendor_id, "vendor_name": v.legal_name, "registered": True}
    if other_name:
        # try to match an existing vendor by (case-insensitive) name first
        nm = other_name.strip().lower()
        for v in s.scalars(select(VendorRecord)).all():
            if v.legal_name.strip().lower() == nm:
                return {"vendor_id": v.vendor_id, "vendor_name": v.legal_name, "registered": True}
        # unregistered entity (the "Other" path)
        return {"vendor_id": None, "vendor_name": other_name.strip(), "registered": False}
    return {"vendor_id": None, "vendor_name": "(unspecified)", "registered": False}


# ---- live financial research (LLM + web) ----
_RESEARCH_SYSTEM = (
    "You are Vera+Rex inside a TPRM platform: a financial research + extraction unit. "
    "Locate the most recent PUBLISHED financial statements for the named entity from "
    "AUTHORITATIVE sources only (UK Companies House/FCA; US SEC EDGAR 10-K/10-Q/20-F; "
    "EU/other national registries + audited annual reports). Reputable press may "
    "corroborate but never be the sole source. Never estimate or fabricate — return null "
    "for any figure you cannot substantiate. Report all monetary figures in MILLIONS of "
    "the reporting currency as plain numbers. Return ONLY a JSON object with this shape: "
    '{"matched":bool,"entity":{"legalName":str,"identifier":str|null,"jurisdiction":str|null},'
    '"period":str,"currency":str,"unit":"millions","figures":{"revenue":num|null,"cogs":num|null,'
    '"grossProfit":num|null,"ebit":num|null,"ebitda":num|null,"netProfit":num|null,"interest":num|null,'
    '"currentAssets":num|null,"currentLiabilities":num|null,"inventory":num|null,"cash":num|null,'
    '"totalAssets":num|null,"totalDebt":num|null,"equity":num|null,"receivables":num|null,'
    '"payables":num|null,"netDebt":num|null,"totalLiabilities":num|null,"retainedEarnings":num|null},'
    '"flags":{"auditQualified":bool,"goingConcern":bool,"negativeEquity":bool,"filingsOnTime":bool},'
    '"sources":[{"name":str,"type":str,"date":str,"url":str}],"confidence":"high"|"medium"|"low",'
    '"limitations":str}'
)


_WEB_RESEARCH_SYSTEM = (
    "You are Vera+Rex+Mira inside a TPRM platform with LIVE WEB SEARCH. Research the "
    "named third party on the open internet and return a combined FINANCIAL DUE DILIGENCE "
    "and REPUTATION assessment. Use web search to find: (a) the most recent PUBLISHED "
    "financial statements from AUTHORITATIVE sources (Companies House/FCA; SEC EDGAR "
    "10-K/10-Q/20-F; national registries; audited annual reports); (b) reputation and "
    "conduct signals from reputable news, regulators, courts and sanctions/PEP lists. "
    "RULES: use only what you actually find via search; never estimate or fabricate a "
    "figure — return null if unsubstantiated. Every material claim must trace to a real "
    "source URL you retrieved. Report monetary figures in MILLIONS of the reporting "
    "currency as plain numbers. Return ONLY a JSON object with this shape: "
    '{"matched":bool,"entity":{"legalName":str,"identifier":str|null,"jurisdiction":str|null},'
    '"financials":{"period":str|null,"currency":str|null,"figures":{"revenue":num|null,'
    '"cogs":num|null,"grossProfit":num|null,"ebit":num|null,"ebitda":num|null,"netProfit":num|null,'
    '"interest":num|null,"currentAssets":num|null,"currentLiabilities":num|null,"inventory":num|null,'
    '"cash":num|null,"totalAssets":num|null,"totalDebt":num|null,"equity":num|null,"receivables":num|null,'
    '"payables":num|null,"retainedEarnings":num|null},"flags":{"auditQualified":bool,'
    '"goingConcern":bool,"negativeEquity":bool,"filingsOnTime":bool},"healthCommentary":str},'
    '"reputation":{"verdict":"Positive"|"Neutral"|"Caution"|"Adverse","adverseMedia":bool,'
    '"sanctionsOrPEP":bool,"litigation":bool,"signals":[{"category":str,"severity":"low"|"medium"|"high",'
    '"summary":str,"date":str|null}]},"sources":[{"title":str,"type":str,"date":str|null,"url":str}],'
    '"confidence":"high"|"medium"|"low","limitations":str}'
)


def web_research_fdd_reputation(company: str, jurisdiction: str = "UK",
                                identifier: str = "", methodology: str = "", mode: str = "both") -> dict:
    """Live internet research for combined FDD + reputation. Requires an AI key
    AND a web-search-capable provider; otherwise returns a clear unavailable note
    so the deterministic engines remain the offline path."""
    from ..agents import llm_config
    st = llm_config.status()
    if not st.get("live_ready"):
        return {"matched": False, "available": False,
                "limitations": ("Live internet research needs an AI key AND the provider "
                                "library installed (Settings → AI provider must show "
                                "'LIVE AI READY'). Otherwise enter figures manually to run "
                                "the deterministic engine.")}
    focus = {"fdd": " Focus on FINANCIAL DUE DILIGENCE; reputation may be brief.",
             "reputation": " Focus on REPUTATION & CONDUCT; financials may be brief.",
             "both": ""}.get(mode, "")
    system = _WEB_RESEARCH_SYSTEM + (("\n\n" + methodology) if methodology else "")
    instruction = (f'Third party: "{company}"'
                   + (f" (identifier/ticker: {identifier})" if identifier else "")
                   + (f", jurisdiction: {jurisdiction}" if jurisdiction else "")
                   + "." + focus
                   + " Search the web now, then return the combined FDD + reputation JSON "
                     "object only, with a real source URL for every material claim.")
    text = llm_config.complete(system, instruction,
                               domain="finance", web_search=True)
    if not text:
        reason = llm_config.last_error() or "the provider returned nothing"
        return {"matched": False, "available": True,
                "limitations": ("AI research did not complete: " + reason +
                                ". Check the AI provider/key/model and web-search entitlement "
                                "in Settings → AI, then retry.")}
    cleaned = text.strip()
    if "```" in cleaned:
        cleaned = cleaned.split("```")[1] if cleaned.count("```") >= 2 else cleaned.replace("```", "")
        if cleaned.lstrip().startswith("json"):
            cleaned = cleaned.replace("json", "", 1).strip()
    try:
        start = cleaned.index("{"); end = cleaned.rindex("}") + 1
        out = json.loads(cleaned[start:end])
        out["available"] = True
        return out
    except Exception:
        return {"matched": False, "available": True, "raw": text[:1200],
                "limitations": "Could not parse research output; see raw text."}


def research_financials(company: str, jurisdiction: str = "UK",
                        identifier: str = "", year: str = "") -> dict:
    """Authoritative financials research. Requires a live LLM key; returns a
    structured 'manual entry' result otherwise so the engine still works offline."""
    from ..agents import llm_config
    if not llm_config.is_enabled():
        return {"matched": False, "available": False,
                "limitations": "Live research needs an AI key (ANTHROPIC_API_KEY / "
                               "OPENAI_API_KEY). Enter the figures manually to run the "
                               "deterministic engine."}
    instruction = (f'Entity: "{company}"'
                   + (f" (identifier/ticker: {identifier})" if identifier else "")
                   + (f", jurisdiction: {jurisdiction}" if jurisdiction else "")
                   + (f", target year: {year}" if year else "")
                   + ". Find the latest authoritative published financials and return the "
                     "JSON object only. If you cannot confidently match an authoritative "
                     'filing, set "matched": false and explain in "limitations".')
    text = llm_config.complete(_RESEARCH_SYSTEM, instruction, domain="finance")
    if not text:
        return {"matched": False, "available": True,
                "limitations": "Research call returned nothing; enter figures manually."}
    # strip code fences and parse
    cleaned = text.strip()
    if "```" in cleaned:
        cleaned = cleaned.split("```")[1] if cleaned.count("```") >= 2 else cleaned.replace("```", "")
        cleaned = cleaned.replace("json", "", 1).strip() if cleaned.lstrip().startswith("json") else cleaned
    try:
        start = cleaned.index("{")
        end = cleaned.rindex("}") + 1
        return json.loads(cleaned[start:end])
    except Exception:
        return {"matched": False, "available": True,
                "limitations": "Could not parse research output; enter figures manually."}
