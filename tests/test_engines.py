"""
Tests for the Reputation (7-pillar) and Contract Management engines.
"""
import sys, os
os.environ["BRO_TRUST_HEADER"] = "1"
os.environ.pop("ANTHROPIC_API_KEY", None)
sys.path.insert(0, "/home/claude/tprm")

from fastapi.testclient import TestClient
from app.bro_app import create_app
from app.features import reputation as REP
from app.features import contracts as CON

H = {"x-user": "admin"}


def _c():
    return TestClient(create_app("sqlite:///:memory:"))


# ---- reputation engine ----
def test_reputation_clean_when_no_events():
    out = REP.assess_reputation([], customer_facing=False)
    assert out["overall"] == 100.0
    assert out["verdict"] == "Clean"
    assert len(out["pillars"]) == 7

def test_reputation_critical_event_drops_pillar():
    out = REP.assess_reputation(
        [{"pillar": "regulatory", "severity": "critical", "title": "FCA fine", "date": "2025-03-01"}])
    reg = next(p for p in out["pillars"] if p["pillar"] == "regulatory")
    assert reg["score"] < 50
    assert out["overall"] < 100

def test_reputation_seven_pillars_present():
    out = REP.assess_reputation([])
    keys = {p["pillar"] for p in out["pillars"]}
    assert keys == {"regulatory", "litigation", "cyber", "esg_environmental",
                    "esg_social", "esg_governance", "media"}

def test_reputation_customer_facing_amplifies_media():
    base = REP.assess_reputation(
        [{"pillar": "media", "severity": "high", "title": "Scandal"}], customer_facing=False)
    cf = REP.assess_reputation(
        [{"pillar": "media", "severity": "high", "title": "Scandal"}], customer_facing=True)
    bm = next(p for p in base["pillars"] if p["pillar"] == "media")["score"]
    cm = next(p for p in cf["pillars"] if p["pillar"] == "media")["score"]
    assert cm < bm   # customer-facing amplifies brand-transfer exposure

def test_reputation_timeline_sorted():
    out = REP.assess_reputation([
        {"pillar": "cyber", "severity": "high", "title": "Breach B", "date": "2024-06-01"},
        {"pillar": "litigation", "severity": "medium", "title": "Suit A", "date": "2023-01-01"}])
    dates = [t["date"] for t in out["timeline"]]
    assert dates == ["2023-01-01", "2024-06-01"]

def test_reputation_endpoint():
    c = _c()
    r = c.post("/api/v2/reputation", json={"events": [
        {"pillar": "cyber", "severity": "critical", "title": "Major breach"}],
        "customer_facing": True}, headers=H)
    assert r.status_code == 200
    body = r.json()
    # the cyber pillar itself shows serious concern even if the weighted overall stays high
    cyber = next(p for p in body["pillars"] if p["pillar"] == "cyber")
    assert cyber["verdict"] in ("Elevated concerns", "Serious concerns")
    assert body["event_count"] == 1


# ---- contract engine: terms scale with inherent risk ----
def test_terms_scale_with_inherent_band():
    low = CON.required_terms("LOW")
    high = CON.required_terms("HIGH")
    assert len(high) > len(low)             # higher risk pulls more terms
    high_keys = {t["key"] for t in high}
    assert "regulator_access" in high_keys  # HIGH-only clause present
    low_keys = {t["key"] for t in low}
    assert "regulator_access" not in low_keys

def test_exposure_flags_pull_clauses_in():
    base = CON.required_terms("LOW", {})
    flagged = CON.required_terms("LOW", {"personal_data": True, "cross_border": True})
    base_keys = {t["key"] for t in base}
    flagged_keys = {t["key"] for t in flagged}
    assert "data_protection" in flagged_keys and "data_protection" not in base_keys
    assert "cross_border" in flagged_keys

def test_gap_report_flags_missing_critical():
    # a thin contract missing data protection at MODERATE -> critical gap
    rep = CON.gap_report("This agreement covers fees and confidentiality only.",
                         "MODERATE", {})
    assert rep["critical_gaps"] >= 1
    assert "Not ready" in rep["verdict"]
    assert any("Data protection" in g["clause"] for g in rep["gaps"])

def test_gap_report_present_when_clause_in_text():
    text = ("Data protection DPA per GDPR Article 28; information security schedule; "
            "audit and inspection rights; sub-processing controls; confidentiality; "
            "term and termination; parties and scope; fees and payment; "
            "limitation of liability.")
    rep = CON.gap_report(text, "MODERATE", {})
    assert any("Data protection" in p["clause"] for p in rep["present"])

def test_existing_vs_to_add_diff():
    prior = ["Master agreement including confidentiality, fees, term and termination, "
             "and data protection DPA per GDPR Article 28."]
    rep = CON.existing_vs_to_add("MODERATE", {}, prior)
    existing_clauses = {e["clause"] for e in rep["terms_already_existing"]}
    to_add_clauses = {t["clause"] for t in rep["terms_to_be_added"]}
    assert any("Data protection" in c for c in existing_clauses)   # found in prior
    assert any("Audit" in c for c in to_add_clauses)               # not in prior
    assert rep["prior_contracts"] == 1

def test_contract_endpoints():
    c = _c()
    t = c.post("/api/v2/contracts/terms", json={"inherent_band": "HIGH"}, headers=H)
    assert t.status_code == 200 and t.json()["count"] > 5
    g = c.post("/api/v2/contracts/gap-report",
               json={"contract_text": "fees only", "inherent_band": "HIGH"}, headers=H)
    assert g.status_code == 200 and g.json()["critical_gaps"] >= 1
    d = c.post("/api/v2/contracts/diff",
               json={"inherent_band": "MODERATE", "prior_contract_texts":
                     ["confidentiality and data protection DPA"]}, headers=H)
    assert d.status_code == 200 and "terms_already_existing" in d.json()


if __name__ == "__main__":
    import traceback
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
    for t in tests:
        try:
            t(); print(f"PASS  {t.__name__}"); passed += 1
        except Exception:
            print(f"FAIL  {t.__name__}"); traceback.print_exc()
    print(f"\n{passed}/{len(tests)} passed")
    sys.exit(0 if passed == len(tests) else 1)
