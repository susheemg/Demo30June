"""CR-3 access control + CR-2 review endpoint."""
import sys, os
os.environ["BRO_TRUST_HEADER"]="1"; os.environ.pop("ANTHROPIC_API_KEY",None)
sys.path.insert(0,"/home/claude/tprm")
from fastapi.testclient import TestClient
from app.bro_app import create_app
A={"x-user":"admin"}
def _c(): return TestClient(create_app("sqlite:///:memory:"))
def _user(c, name, role):
    c.post("/api/v1/admin/users", json={"username":name,"password":"x","role_key":role}, headers=A)
    return {"x-user":name}

def _seed_assessment(c, owner_header, owner_name):
    v=c.post("/api/v2/vendors", json={"legal_name":"Acme"}, headers=A).json()["vendor_id"]
    e=c.post("/api/v2/engagements", json={"vendor_id":v,"title":"Svc"}, headers=owner_header).json()["engagement_id"]
    # capture an assessment via session so it has an owner
    sid=c.post("/api/v1/agent/sessions", json={}, headers=owner_header).json()["session_id"]
    for i in range(8): c.post("/api/v1/agent/send", json={"session_id":sid,"message":f"a{i}: PII"}, headers=owner_header)
    aid=c.post("/api/v2/assessments/from-session", json={"session_id":sid,"engagement_id":e,"vendor_id":v}, headers=owner_header).json()["assessment_id"]
    return v,e,aid

def test_assessor_sees_all():
    c=_c(); buyer=_user(c,"biz","buyer"); vrm=_user(c,"assessor1","vrm")
    v,e,aid=_seed_assessment(c, buyer, "biz")
    rows=c.get("/api/v2/assessments", headers=vrm).json()
    assert any(r["assessment_id"]==aid for r in rows)  # assessor sees buyer's record

def test_admin_reviewer_sees_all():
    c=_c(); buyer=_user(c,"biz","buyer")
    v,e,aid=_seed_assessment(c, buyer, "biz")
    rows=c.get("/api/v2/assessments", headers=A).json()
    assert any(r["assessment_id"]==aid for r in rows)

def test_business_user_sees_only_own():
    c=_c(); biz1=_user(c,"biz1","buyer"); biz2=_user(c,"biz2","buyer")
    v,e,aid=_seed_assessment(c, biz1, "biz1")
    # biz2 must NOT see biz1's record
    rows2=c.get("/api/v2/assessments", headers=biz2).json()
    assert not any(r["assessment_id"]==aid for r in rows2)
    # biz1 sees their own
    rows1=c.get("/api/v2/assessments", headers=biz1).json()
    assert any(r["assessment_id"]==aid for r in rows1)

def test_vendor_sees_none():
    c=_c(); biz=_user(c,"biz","buyer"); vend=_user(c,"vend1","vendor")
    v,e,aid=_seed_assessment(c, biz, "biz")
    r=c.get("/api/v2/assessments", headers=vend)
    # vendor is denied entirely (403 at permission layer) or, if reachable, sees nothing
    assert r.status_code==403 or (r.status_code==200 and len(r.json())==0)

def test_vendor_blocked_from_review_detail():
    c=_c(); biz=_user(c,"biz","buyer"); vend=_user(c,"vend1","vendor")
    v,e,aid=_seed_assessment(c, biz, "biz")
    r=c.get(f"/api/v2/assessments/{aid}/review", headers=vend)
    assert r.status_code==403

def test_review_detail_shape():
    c=_c(); buyer=_user(c,"biz","buyer")
    v,e,aid=_seed_assessment(c, buyer, "biz")
    d=c.get(f"/api/v2/assessments/{aid}/review", headers=A).json()
    for k in ("scope","inherent","controls_assessed","documents","residual","can_approve"):
        assert k in d
    assert d["can_approve"] is True  # admin can approve

def test_business_user_cannot_approve_via_review():
    c=_c(); buyer=_user(c,"biz","buyer")
    v,e,aid=_seed_assessment(c, buyer, "biz")
    d=c.get(f"/api/v2/assessments/{aid}/review", headers=buyer).json()
    assert d["can_approve"] is False  # buyer reviews but cannot approve

if __name__=="__main__":
    import traceback
    tests=[v for k,v in sorted(globals().items()) if k.startswith("test_")]
    p=0
    for t in tests:
        try: t(); print(f"PASS  {t.__name__}"); p+=1
        except Exception: print(f"FAIL  {t.__name__}"); traceback.print_exc()
    print(f"\n{p}/{len(tests)} passed"); sys.exit(0 if p==len(tests) else 1)
