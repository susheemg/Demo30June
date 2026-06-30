"""Pass 3 — platform: pagination, bulk CSV vendor import, migration + CI scaffolding."""
import io
import os
import sys

sys.path.insert(0, "/home/claude/tprm")
os.environ["BRO_TRUST_HEADER"] = "1"

from fastapi.testclient import TestClient  # noqa: E402
from app.bro_app import create_app  # noqa: E402

H = {"x-user": "admin"}
DB = "sqlite:////tmp/plat.db"


def _client():
    if os.path.exists("/tmp/plat.db"):
        os.remove("/tmp/plat.db")
    return TestClient(create_app(DB))


def test_vendor_list_pagination():
    c = _client()
    full = c.get("/api/v1/vendors", headers=H).json()
    page = c.get("/api/v1/vendors?limit=3&offset=1", headers=H).json()
    assert len(page) == min(3, max(0, len(full) - 1))
    if len(full) > 1:
        assert page[0]["vendor_id"] == full[1]["vendor_id"]


def test_csv_import_preview_then_commit():
    c = _client()
    c.post("/api/v2/vendors", headers=H, json={"legal_name": "Existing Ltd"})
    csv = ("legal_name,tier,hq_country,is_critical\n"
           "NewCo Alpha,Tier 1,GB,yes\n"
           "NewCo Beta,Tier 9,US,\n"          # bad tier -> defaults Tier 3
           "Existing Ltd,Tier 2,,\n"          # duplicate vs register
           "NewCo Alpha,,,\n"                 # duplicate in file
           ",,,\n")                           # missing name
    files = {"file": ("vendors.csv", io.BytesIO(csv.encode()), "text/csv")}
    p = c.post("/api/v2/vendors/import", headers=H, files=files,
               data={"mode": "preview"}).json()
    assert p["mode"] == "preview" and p["valid"] == 2 and len(p["errors"]) == 3
    assert p["created"] == []
    files = {"file": ("vendors.csv", io.BytesIO(csv.encode()), "text/csv")}
    cm = c.post("/api/v2/vendors/import", headers=H, files=files,
                data={"mode": "commit"}).json()
    assert len(cm["created"]) == 2
    names = {v["legal_name"]: v for v in c.get("/api/v2/vendors", headers=H).json()}
    assert "NewCo Alpha" in names and names["NewCo Alpha"]["is_critical"] is True
    assert names["NewCo Beta"]["tier"] == "Tier 3"


def test_csv_import_rejects_non_csv():
    c = _client()
    files = {"file": ("v.exe", io.BytesIO(b"MZbinary"), "application/octet-stream")}
    assert c.post("/api/v2/vendors/import", headers=H, files=files,
                  data={"mode": "preview"}).status_code == 415


def test_migration_and_ci_scaffolding_present():
    base = "/home/claude/tprm"
    assert os.path.exists(f"{base}/alembic.ini")
    assert os.path.isdir(f"{base}/migrations/versions")
    roots = [f for f in os.listdir(f"{base}/migrations/versions") if f.endswith(".py")]
    assert roots, "migration chain present"
    assert os.path.exists(f"{base}/.github/workflows/ci.yml")
    assert os.path.exists(f"{base}/prompt_evals.py")


if __name__ == "__main__":
    for fn in [v for k, v in sorted(globals().items()) if k.startswith("test_")]:
        try:
            fn()
            print(f"PASS {fn.__name__}")
        except Exception as e:
            print(f"FAIL {fn.__name__}: {e}")
