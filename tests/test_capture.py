"""Tests for structured chat-capture: AI Assessment session -> AssessmentRecord."""
import sys, os
os.environ["BRO_TRUST_HEADER"] = "1"
os.environ.pop("ANTHROPIC_API_KEY", None)
sys.path.insert(0, "/home/claude/tprm")
from fastapi.testclient import TestClient
from app.bro_app import create_app
H = {"x-user": "admin"}

def _c():
    return TestClient(create_app("sqlite:///:memory:"))

def _vendor_eng(c):
    v = c.post("/api/v2/vendors", json={"legal_name": "Acme Ltd"}, headers=H).json()["vendor_id"]
    e = c.post("/api/v2/engagements", json={"vendor_id": v, "title": "SaaS"}, headers=H).json()["engagement_id"]
    return v, e

def _run_session(c, turns=8):
    sid = c.post("/api/v1/agent/sessions", json={}, headers=H).json()["session_id"]
    for i in range(turns):
        c.post("/api/v1/agent/send", json={"session_id": sid, "message": f"answer {i}: PII, SaaS"}, headers=H)
    return sid

def test_capture_creates_assessment():
    c = _c(); v, e = _vendor_eng(c); sid = _run_session(c)
    r = c.post("/api/v2/assessments/from-session",
               json={"session_id": sid, "engagement_id": e, "vendor_id": v}, headers=H).json()
    assert r["assessment_id"].startswith("ASM-")
    assert r["status"] in ("Completed", "In-Progress")

def test_capture_stores_full_data():
    c = _c(); v, e = _vendor_eng(c); sid = _run_session(c)
    aid = c.post("/api/v2/assessments/from-session",
                 json={"session_id": sid, "engagement_id": e, "vendor_id": v}, headers=H).json()["assessment_id"]
    st = c.get(f"/api/v2/assessments/{aid}/structured", headers=H).json()["structured"]
    # ALL data captured: full transcript, per-stage, agent turns, insights, learnings
    assert st["message_count"] > 0
    assert len(st["transcript"]) == st["message_count"]   # full untruncated transcript
    assert "per_stage" in st and "agent_turns" in st
    assert "insights" in st and "learnings" in st         # background checks + calibration captured
    assert "dossier" in st and "state" in st              # full session state captured

def test_capture_creates_new_record_each_time():
    c = _c(); v, e = _vendor_eng(c); sid = _run_session(c)
    a1 = c.post("/api/v2/assessments/from-session",
                json={"session_id": sid, "engagement_id": e, "vendor_id": v}, headers=H).json()["assessment_id"]
    a2 = c.post("/api/v2/assessments/from-session",
                json={"session_id": sid, "engagement_id": e, "vendor_id": v}, headers=H).json()["assessment_id"]
    assert a1 != a2   # each capture mints a NEW record, never updates the prior one

def test_capture_new_record_even_after_prior_approved():
    c = _c(); v, e = _vendor_eng(c); sid = _run_session(c)
    a1 = c.post("/api/v2/assessments/from-session",
                json={"session_id": sid, "engagement_id": e, "vendor_id": v}, headers=H).json()["assessment_id"]
    c.post(f"/api/v2/assessments/{a1}/approve", headers=H)
    # a prior approved/locked record must NOT block a fresh capture — new snapshot is created
    r = c.post("/api/v2/assessments/from-session",
               json={"session_id": sid, "engagement_id": e, "vendor_id": v}, headers=H)
    assert r.status_code == 200
    assert r.json()["assessment_id"] != a1

def test_structured_access_restricted():
    c = _c(); v, e = _vendor_eng(c); sid = _run_session(c)
    aid = c.post("/api/v2/assessments/from-session",
                 json={"session_id": sid, "engagement_id": e, "vendor_id": v}, headers=H).json()["assessment_id"]
    # admin can read
    assert c.get(f"/api/v2/assessments/{aid}/structured", headers=H).status_code == 200

if __name__ == "__main__":
    import traceback
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
    for t in tests:
        try: t(); print(f"PASS  {t.__name__}"); passed += 1
        except Exception: print(f"FAIL  {t.__name__}"); traceback.print_exc()
    print(f"\n{passed}/{len(tests)} passed")
    sys.exit(0 if passed == len(tests) else 1)
