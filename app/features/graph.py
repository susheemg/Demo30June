"""Phase 2 — Entity / ownership graph, concentration & contagion (point-in-time).
Builds a structural graph over the current estate:
  • common-ownership clusters (vendors sharing an ultimate parent or vendor group),
  • shared fourth parties (sub-providers serving many vendors → single points of failure),
  • contagion ("if this entity fails, who falls over").
No history required."""
from __future__ import annotations
from sqlalchemy import select


def _norm(s):
    return (s or "").strip().lower()


def build_graph(s) -> dict:
    from .registry_models import (VendorRecord, EngagementRecord, VendorGroup,
                                  FourthPartyRecord, FourthPartyVendor)
    vendors = s.scalars(select(VendorRecord)).all()
    vmap = {v.vendor_id: v for v in vendors}
    total = len(vendors) or 1
    groups = {g.group_id: g for g in s.scalars(select(VendorGroup)).all()}
    engs = s.scalars(select(EngagementRecord)).all()
    eng_by_vendor = {}
    for e in engs:
        eng_by_vendor.setdefault(e.vendor_id, []).append(e)
    fps = {f.fourth_party_id: f for f in s.scalars(select(FourthPartyRecord)).all()}
    links = s.scalars(select(FourthPartyVendor)).all()

    # ---- common-ownership clusters ----
    by_owner = {}  # key -> {"label":, "kind":, "vendors":[]}
    for v in vendors:
        key = None; label = None; kind = None
        if v.ultimate_parent:
            key = "UP:" + _norm(v.ultimate_parent); label = v.ultimate_parent; kind = "ultimate parent"
        elif v.group_id:
            g = groups.get(v.group_id)
            label = (g.name if g else v.group_id); key = "GR:" + v.group_id; kind = "vendor group"
        if not key:
            continue
        slot = by_owner.setdefault(key, {"label": label, "kind": kind, "vendors": []})
        slot["vendors"].append({"vendor_id": v.vendor_id, "legal_name": v.legal_name,
                                "is_critical": v.is_critical})
    ownership = [{"owner": o["label"], "kind": o["kind"],
                  "vendor_count": len(o["vendors"]),
                  "critical_count": sum(1 for x in o["vendors"] if x["is_critical"]),
                  "vendors": o["vendors"]}
                 for o in by_owner.values() if len(o["vendors"]) > 1]
    ownership.sort(key=lambda x: x["vendor_count"], reverse=True)

    # ---- shared fourth parties ----
    fp_vendors = {}
    for ln in links:
        fp_vendors.setdefault(ln.fourth_party_id, []).append(ln.vendor_id)
    shared = []
    for fid, vids in fp_vendors.items():
        if len(vids) <= 1:
            continue
        f = fps.get(fid)
        crit = sum(1 for vid in vids if vmap.get(vid) and vmap[vid].is_critical)
        reach = round(len(vids) / total * 100)
        shared.append({"fourth_party_id": fid,
                       "legal_name": f.legal_name if f else fid,
                       "service": (f.service_provided if f else None),
                       "hq_country": (f.hq_country if f else None),
                       "vendor_count": len(vids), "critical_count": crit,
                       "reach_pct": reach,
                       "spof": len(vids) >= max(10, total * 0.15)})
    shared.sort(key=lambda x: x["vendor_count"], reverse=True)

    stats = {
        "vendors": len(vendors),
        "multi_vendor_owners": len(ownership),
        "shared_fourth_parties": len(shared),
        "max_fanout": shared[0]["vendor_count"] if shared else 0,
        "max_fanout_pct": shared[0]["reach_pct"] if shared else 0,
        "spof_count": sum(1 for x in shared if x["spof"]),
    }
    return {"ownership_clusters": ownership, "shared_fourth_parties": shared, "stats": stats}


def contagion(s, node_type: str, node_id: str) -> dict:
    """If this entity degrades, which vendors and engagements are exposed?"""
    from .registry_models import (VendorRecord, EngagementRecord, VendorGroup,
                                  FourthPartyRecord, FourthPartyVendor)
    vmap = {v.vendor_id: v for v in s.scalars(select(VendorRecord)).all()}
    engs = s.scalars(select(EngagementRecord)).all()
    eng_by_vendor = {}
    for e in engs:
        eng_by_vendor.setdefault(e.vendor_id, []).append(e)

    affected = []  # vendor_ids
    label = node_id
    if node_type == "fourth_party":
        f = s.scalars(select(FourthPartyRecord).where(
            FourthPartyRecord.fourth_party_id == node_id)).first()
        label = f.legal_name if f else node_id
        affected = [ln.vendor_id for ln in s.scalars(select(FourthPartyVendor).where(
            FourthPartyVendor.fourth_party_id == node_id)).all()]
    elif node_type == "owner":
        # node_id is the owner label; match ultimate_parent or group name
        g = s.scalars(select(VendorGroup).where(VendorGroup.name == node_id)).first()
        gid = g.group_id if g else None
        affected = [v.vendor_id for v in vmap.values()
                    if _norm(v.ultimate_parent) == _norm(node_id)
                    or (gid and v.group_id == gid)]
    elif node_type == "vendor":
        affected = [node_id]
        label = vmap[node_id].legal_name if node_id in vmap else node_id

    vendors_out, eng_count, bus = [], 0, set()
    for vid in dict.fromkeys(affected):
        v = vmap.get(vid)
        if not v:
            continue
        ve = eng_by_vendor.get(vid, [])
        eng_count += len(ve)
        for e in ve:
            if getattr(e, "business_unit", None):
                bus.add(e.business_unit)
        vendors_out.append({"vendor_id": vid, "legal_name": v.legal_name,
                            "is_critical": v.is_critical, "engagements": len(ve)})
    vendors_out.sort(key=lambda x: (not x["is_critical"], -x["engagements"]))
    return {"node_type": node_type, "node_id": node_id, "label": label,
            "affected_vendors": vendors_out, "vendor_count": len(vendors_out),
            "engagement_count": eng_count, "critical_count": sum(1 for x in vendors_out if x["is_critical"]),
            "business_units": sorted(bus)}
