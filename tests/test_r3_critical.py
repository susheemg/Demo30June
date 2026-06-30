"""R3: Critical Vendors module — 4 params, deterministic engine, designation chain, override."""
import sys, os
os.environ["BRO_TRUST_HEADER"] = "1"; os.environ.pop("ANTHROPIC_API_KEY", None)
sys.path.insert(0, "/home/claude/tprm")
from fastapi.testclient import TestClient
from app.bro_app import create_app
H = {"x-user": "admin"}
def _c(): return TestClient(create_app("sqlite:///:memory:"))
def _v(c, n="Acme Ltd"): return c.post("/api/v2/vendors", json={"legal_name": n}, headers=H).json()["vendor_id"]
def _e(c, v): return c.post("/api/v2/engagements", json={"vendor_id": v, "title": "Svc"}, headers=H).json()["engagement_id"]

def test_four_params_low_scores_not_critical():
    c = _c(); v = _v(c); e = _e(c, v)
    r = c.put(f"/api/v2/engagements/{e}/criticality-inputs", json={
        "customer_impact": 1, "downtime_tolerance": 2, "alternative_availability": 1, "substitution_complexity": 2}, headers=H).json()
    assert r["is_critical"] is False and r["score"] < 3.5

def test_four_params_high_scores_critical():
    c = _c(); v = _v(c); e = _e(c, v)
    r = c.put(f"/api/v2/engagements/{e}/criticality-inputs", json={
        "customer_impact": 5, "downtime_tolerance": 5, "alternative_availability": 4, "substitution_complexity": 5}, headers=H).json()
    assert r["is_critical"] is True and r["score"] >= 3.5

def test_missing_params_resolved_risk_averse():
    c = _c(); v = _v(c); e = _e(c, v)
    # no inputs set -> all gaps -> worst-case -> critical, with gaps listed
    r = c.get(f"/api/v2/engagements/{e}/criticality", headers=H).json()
    assert r["is_critical"] is True and len(r["gaps"]) == 4

def test_deterministic_repeatable():
    c = _c(); v = _v(c); e = _e(c, v)
    c.put(f"/api/v2/engagements/{e}/criticality-inputs", json={"customer_impact": 4, "downtime_tolerance": 4, "alternative_availability": 3, "substitution_complexity": 3}, headers=H)
    a = c.get(f"/api/v2/engagements/{e}/criticality", headers=H).json()["score"]
    b = c.get(f"/api/v2/engagements/{e}/criticality", headers=H).json()["score"]
    assert a == b

def test_chain_engagement_to_vendor():
    c = _c(); v = _v(c); e = _e(c, v)
    c.put(f"/api/v2/engagements/{e}/criticality-inputs", json={"customer_impact": 5, "downtime_tolerance": 5, "alternative_availability": 5, "substitution_complexity": 5}, headers=H)
    res = c.post("/api/v2/critical-vendors/analyse", json={"vendor_id": v}, headers=H).json()
    assert v in res["critical_vendors"]
    # authoritative flag set on vendor master
    m = c.get(f"/api/v2/vendor-master/{v}", headers=H).json()
    assert m["is_critical"] is True

def test_chain_marks_contracts_critical():
    c = _c(); v = _v(c); e = _e(c, v)
    cid = c.post("/api/v2/contracts", json={"contract_type": "Contract", "engagement_id": e}, headers=H).json()["contract_id"]
    c.put(f"/api/v2/engagements/{e}/criticality-inputs", json={"customer_impact": 5, "downtime_tolerance": 5, "alternative_availability": 5, "substitution_complexity": 5}, headers=H)
    c.post("/api/v2/critical-vendors/analyse", json={"vendor_id": v}, headers=H)
    contracts = c.get(f"/api/v2/contracts?engagement_id={e}", headers=H).json()
    assert contracts[0]["is_critical"] is True

def test_mission_critical_floor():
    c = _c(); v = _v(c); e = _e(c, v)
    c.put(f"/api/v2/engagement-register/{e}", json={"data": {"mission_critical": True}}, headers=H)
    c.put(f"/api/v2/engagements/{e}/criticality-inputs", json={"customer_impact": 1, "downtime_tolerance": 1, "alternative_availability": 1, "substitution_complexity": 1}, headers=H)
    r = c.get(f"/api/v2/engagements/{e}/criticality", headers=H).json()
    assert r["is_critical"] is True  # floored by mission-critical

def test_manual_override_respected():
    c = _c(); v = _v(c); e = _e(c, v)
    c.put(f"/api/v2/engagements/{e}/criticality-inputs", json={"customer_impact": 5, "downtime_tolerance": 5, "alternative_availability": 5, "substitution_complexity": 5}, headers=H)
    c.post("/api/v2/critical-vendors/analyse", json={"vendor_id": v}, headers=H)
    # override to NOT critical
    c.post(f"/api/v2/critical-vendors/{v}/override", json={"is_critical": False, "reason": "compensating controls"}, headers=H)
    # re-run analysis must respect the override
    res = c.post("/api/v2/critical-vendors/analyse", json={"vendor_id": v}, headers=H).json()
    assert res["results"][0]["override_in_effect"] is True
    m = c.get(f"/api/v2/vendor-master/{v}", headers=H).json()
    assert m["is_critical"] is False

def test_list_critical():
    c = _c(); v = _v(c); e = _e(c, v)
    c.put(f"/api/v2/engagements/{e}/criticality-inputs", json={"customer_impact": 5, "downtime_tolerance": 5, "alternative_availability": 5, "substitution_complexity": 5}, headers=H)
    c.post("/api/v2/critical-vendors/analyse", json={"vendor_id": v}, headers=H)
    lst = c.get("/api/v2/critical-vendors", headers=H).json()
    assert any(x["id"] == v for x in lst["critical_vendors"])
    assert any(x["id"] == e for x in lst["critical_engagements"])

if __name__ == "__main__":
    import traceback
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    p = 0
    for t in tests:
        try: t(); print(f"PASS  {t.__name__}"); p += 1
        except Exception: print(f"FAIL  {t.__name__}"); traceback.print_exc()
    print(f"\n{p}/{len(tests)} passed"); sys.exit(0 if p == len(tests) else 1)
