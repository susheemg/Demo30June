"""Sanctions & AML screening tests: deterministic matching bands, authoritative
source catalogue, audit persistence, real-vendor safety (Clear), and the
portfolio sweep."""
import os
import sys

sys.path.insert(0, "/home/claude/tprm")
os.environ["BRO_TRUST_HEADER"] = "1"

from fastapi.testclient import TestClient  # noqa: E402
from app.bro_app import create_app, make_session_factory, make_engine  # noqa: E402
from app.features import sanctions as SANC  # noqa: E402
from app.features.registry_models import VendorRecord, SanctionsScreening  # noqa: E402

H = {"x-user": "admin"}
DB = "sqlite:////tmp/sanc_test.db"


def test_sanctioned_entity_is_hit():
    r = SANC.screen_name("Volkov Industrial")
    assert r["band"] == "Hit" and r["hit_count"] >= 1
    assert r["hits"][0]["source"] == "OFAC" and r["hits"][0]["category"] == "sanction"


def test_pep_is_review():
    r = SANC.screen_name("Adaeze Okonkwo", "NG")
    assert r["band"] in ("Review", "Hit")
    assert any(h["category"] == "pep" for h in r["hits"])


def test_adverse_media_is_review():
    r = SANC.screen_name("Helios Capital Partners")
    assert r["band"] == "Review" and any(h["category"] == "adverse" for h in r["hits"])


def test_clean_name_is_clear():
    # a real company name not on the (fictional) watchlist must come back Clear
    assert SANC.screen_name("Amazon Web Services")["band"] == "Clear"
    assert SANC.screen_name("Helios Holdings")["band"] == "Clear"  # no false positive


def test_sources_catalogue():
    s = SANC.sources()
    assert sum(1 for x in s["sanctions"] if x.get("tier1")) == 4   # OFAC/UN/EU/OFSI
    assert len(s["provider_checklist"]) == 8 and len(s["pep_anchors"]) == 3


def test_endpoint_screen_persists_for_audit():
    c = TestClient(create_app("sqlite:///:memory:"))
    r = c.post("/api/v2/sanctions/screen", headers=H, json={"name": "Crimson Star Shipping"})
    assert r.status_code == 200 and r.json()["band"] == "Hit"
    sid = r.json()["screening_id"]
    assert sid.startswith("SCR")
    lst = c.get("/api/v2/sanctions/screenings", headers=H).json()
    assert any(x["screening_id"] == sid for x in lst)


def test_vendor_screen_and_portfolio_summary():
    p = "/tmp/sanc_test.db"
    if os.path.exists(p):
        os.remove(p)
    app = create_app(DB)
    s = make_session_factory(make_engine(DB))()
    s.add(VendorRecord(vendor_id="VEN-S1", legal_name="Contoso Cloud Ltd", hq_country="US"))
    s.commit()
    c = TestClient(app)
    rv = c.post("/api/v2/sanctions/screen", headers=H, json={"vendor_id": "VEN-S1"}).json()
    assert rv["band"] == "Clear" and rv["hit_count"] == 0   # real vendor safe
    summ = c.get("/api/v2/sanctions/summary", headers=H).json()
    assert summ["screened"] >= 1 and summ["distribution"]["Clear"] >= 1


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
