"""Tests for SLA Management + Performance Issues."""
import os
os.environ["BRO_TRUST_HEADER"] = "1"
import pytest
from fastapi.testclient import TestClient
from app.bro_app import create_app

H = {"X-User": "admin"}


@pytest.fixture()
def client(tmp_path):
    db = tmp_path / "perf.db"
    return TestClient(create_app(f"sqlite:///{db}"))


def test_sla_extract_and_list(client):
    r = client.post("/api/v2/slas/extract",
                    json={"engagement_id": "ENG-1", "vendor_id": "VEN-1", "mode": "contract"}, headers=H)
    assert r.status_code == 200
    assert r.json()["extracted"] == 4
    slas = client.get("/api/v2/slas?engagement_id=ENG-1", headers=H).json()
    assert len(slas) == 4
    assert all(x["source"] == "contract" for x in slas)
    assert all(x["sla_id"].startswith("SLA-") for x in slas)


def test_sla_upload_extract(client):
    r = client.post("/api/v2/slas/extract",
                    json={"engagement_id": "ENG-2", "mode": "upload"}, headers=H)
    assert r.json()["extracted"] == 2


def test_manual_sla_and_measurement_breach(client):
    r = client.post("/api/v2/slas", json={
        "engagement_id": "ENG-3", "description": "Uptime", "threshold_type": "min",
        "threshold": 99.9, "unit": "%", "baseline": 99.95, "window": "monthly"}, headers=H)
    assert r.status_code == 200
    sid = r.json()["sla_id"]
    # met then breach
    client.post(f"/api/v2/slas/{sid}/measurements", json={"period": "2026-04", "value": 99.95}, headers=H)
    row = client.post(f"/api/v2/slas/{sid}/measurements",
                      json={"period": "2026-05", "value": 99.5}, headers=H).json()
    assert row["status"] == "breach"
    assert row["latest_value"] == 99.5


def test_max_type_verdict(client):
    sid = client.post("/api/v2/slas", json={
        "engagement_id": "ENG-4", "description": "Response", "threshold_type": "max",
        "threshold": 30, "unit": "min", "window": "monthly"}, headers=H).json()["sla_id"]
    row = client.post(f"/api/v2/slas/{sid}/measurements",
                      json={"period": "2026-05", "value": 18}, headers=H).json()
    assert row["status"] == "met"
    row2 = client.post(f"/api/v2/slas/{sid}/measurements",
                       json={"period": "2026-05", "value": 41}, headers=H).json()
    assert row2["status"] == "breach"  # upsert same period


def test_quarterly_periods(client):
    sid = client.post("/api/v2/slas", json={
        "engagement_id": "ENG-5", "description": "DR test", "threshold_type": "min",
        "threshold": 1, "unit": "count", "window": "quarterly"}, headers=H).json()["sla_id"]
    row = client.get("/api/v2/slas?engagement_id=ENG-5", headers=H).json()[0]
    assert len(row["periods"]) == 4
    assert all("-Q" in p for p in row["periods"])


def test_sla_summary_and_enquiry(client):
    client.post("/api/v2/slas/extract", json={"engagement_id": "ENG-6", "mode": "contract"}, headers=H)
    slas = client.get("/api/v2/slas?engagement_id=ENG-6", headers=H).json()
    up = [x for x in slas if "availability" in x["description"].lower()][0]
    client.post(f"/api/v2/slas/{up['sla_id']}/measurements",
                json={"period": "2026-05", "value": 99.0}, headers=H)
    summ = client.get("/api/v2/slas/summary?engagement_id=ENG-6", headers=H).json()
    assert summ["breached"] >= 1
    assert "compliance_rate" in summ
    enq = client.post("/api/v2/slas/enquiry",
                      json={"engagement_id": "ENG-6", "question": "which are breached?"}, headers=H).json()
    assert "breach" in enq["answer"].lower()


def test_sla_edit_and_delete(client):
    sid = client.post("/api/v2/slas", json={
        "engagement_id": "ENG-7", "description": "X", "threshold": 1}, headers=H).json()["sla_id"]
    r = client.put(f"/api/v2/slas/{sid}", json={"description": "Updated", "threshold": 2}, headers=H)
    assert r.json()["description"] == "Updated" and r.json()["threshold"] == 2
    d = client.delete(f"/api/v2/slas/{sid}", headers=H)
    assert d.json()["deleted"] is True
    assert len(client.get("/api/v2/slas?engagement_id=ENG-7", headers=H).json()) == 0


def test_perf_issue_crud_and_lifecycle(client):
    r = client.post("/api/v2/performance-issues", json={
        "engagement_id": "ENG-8", "title": "Latency spikes", "severity": "High",
        "category": "Latency / performance", "source": "Manual"}, headers=H)
    assert r.status_code == 200
    pid = r.json()["pis_id"]
    assert pid.startswith("PIS-")
    assert len(r.json()["progress_notes"]) == 1
    # advance
    adv = client.post(f"/api/v2/performance-issues/{pid}/advance", headers=H).json()
    assert adv["status"] == "In Progress"
    # note
    client.post(f"/api/v2/performance-issues/{pid}/note", json={"note": "Vendor engaged"}, headers=H)
    # edit
    client.put(f"/api/v2/performance-issues/{pid}", json={"status": "Closed"}, headers=H)
    issues = client.get("/api/v2/performance-issues?engagement_id=ENG-8", headers=H).json()
    assert issues[0]["status"] == "Closed"
    assert issues[0]["closed_date"] is not None


def test_perf_issue_severity_summary_and_filters(client):
    for sev in ["Critical", "High", "Medium"]:
        client.post("/api/v2/performance-issues",
                    json={"engagement_id": "ENG-9", "title": f"I-{sev}", "severity": sev}, headers=H)
    summ = client.get("/api/v2/performance-issues/summary?engagement_id=ENG-9", headers=H).json()
    assert summ["Critical"] == 1 and summ["High"] == 1 and summ["open_total"] == 3
    crit = client.get("/api/v2/performance-issues?engagement_id=ENG-9&severity=Critical", headers=H).json()
    assert len(crit) == 1


def test_raise_issue_from_sla_breach(client):
    sid = client.post("/api/v2/slas", json={
        "engagement_id": "ENG-10", "description": "Accuracy", "threshold_type": "min",
        "threshold": 99.99, "unit": "%", "window": "quarterly"}, headers=H).json()["sla_id"]
    # not in breach yet
    r0 = client.post("/api/v2/performance-issues/raise-from-sla", json={"sla_id": sid}, headers=H)
    assert r0.json()["raised"] is False
    # breach it
    client.post(f"/api/v2/slas/{sid}/measurements", json={"period": "2026-Q2", "value": 99.5}, headers=H)
    r1 = client.post("/api/v2/performance-issues/raise-from-sla", json={"sla_id": sid}, headers=H)
    assert r1.json()["raised"] is True
    assert r1.json()["issue"]["severity"] == "Critical"  # >=99.99 min -> Critical
    assert r1.json()["issue"]["source"] == "SLA breach"
    # idempotent: second raise blocked while open
    r2 = client.post("/api/v2/performance-issues/raise-from-sla", json={"sla_id": sid}, headers=H)
    assert r2.json()["raised"] is False
