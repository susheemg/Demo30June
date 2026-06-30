"""
Group A: seed data + RBAC checks (ported from database.py PERMISSIONS/SYSTEM_ROLES).

49 permissions across 10 categories and 4 protected system roles, reproduced
exactly from the uploaded app so behaviour parity holds. has_permission() is the
basis for the FastAPI RBAC dependency.
"""
from __future__ import annotations

import os

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models_db import (
    Base, Permission, Role, RolePermission, User, Vendor,
    hash_password,
)

# (category, key, label) — exact port.
PERMISSIONS: list[tuple[str, str, str]] = [
    ("Engagements", "engagement.view", "View engagements"),
    ("Engagements", "engagement.create", "Create engagements"),
    ("Engagements", "engagement.edit", "Edit engagements / answer IRQ & DDQ"),
    ("Engagements", "engagement.publish", "Publish assessment reports"),
    ("Engagements", "engagement.review", "Review & sign off (Assessor)"),
    ("Engagements", "engagement.assign", "Assign engagements to assessors (Controller)"),
    ("Global Regulations", "reg.view", "View the global regulatory catalogue"),
    ("Global Regulations", "reg.assess", "Run AI regulatory updates & gap assessment"),
    ("Data Quality", "integrity.view", "View data-integrity health & issues"),
    ("Data Quality", "integrity.manage", "Apply fixes, merges & enrichment"),
    ("Supplier Incidents", "incident.view", "View supplier incidents"),
    ("Supplier Incidents", "incident.manage", "Create & manage supplier incidents"),
    ("Engagements", "engagement.override", "Override decisions"),
    ("Engagements", "engagement.autopilot", "Run AI autopilot assessment"),
    ("Vendors", "vendor.view", "View vendor register"),
    ("Vendors", "vendor.edit", "Add / edit vendors"),
    ("Vendors", "vendor.critical", "Designate critical vendors"),
    ("Action Plan", "finding.view", "View findings / action plan"),
    ("Action Plan", "finding.manage", "Raise & manage findings"),
    ("Action Plan", "finding.delete", "Delete findings"),
    ("Action Plan", "acceptance.manage", "Record risk acceptances"),
    ("Intelligence", "intel.financial", "Run financial due diligence & monitoring"),
    ("Intelligence", "intel.reputation", "Run reputation & ESG screening"),
    ("Intelligence", "intel.contract", "Generate & review contracts"),
    ("Intelligence", "intel.evidence", "Auto-validate assurance evidence"),
    ("Intelligence", "intel.ratings", "View external security ratings"),
    ("Intelligence", "intel.sanctions", "Run sanctions, PEP & UBO screening"),
    ("Lifecycle", "lifecycle.fourthparty", "Manage 4th-party register"),
    ("Lifecycle", "lifecycle.documents", "Upload & manage documents"),
    ("Lifecycle", "lifecycle.monitoring", "Run & view monitoring sweeps"),
    ("Lifecycle", "lifecycle.reassess", "Manage reassessments"),
    ("Lifecycle", "lifecycle.offboard", "Run offboarding workflow"),
    ("Lifecycle", "lifecycle.certs", "Manage certifications"),
    ("Lifecycle", "lifecycle.evidence", "Track & validate evidence expiry"),
    ("Lifecycle", "lifecycle.cap", "Manage corrective action plans"),
    ("Lifecycle", "lifecycle.performance", "Manage vendor performance & SLAs"),
    ("Lifecycle", "lifecycle.obligations", "Manage contract obligations"),
    ("Lifecycle", "lifecycle.bia", "Manage business impact analysis"),
    ("Lifecycle", "lifecycle.incident", "Manage third-party incidents"),
    ("Notifications", "notify.view", "View notifications"),
    ("Notifications", "notify.inbound", "Process inbound email submissions"),
    ("Dashboards", "dashboard.trending", "View risk-score trending"),
    ("Dashboards", "dashboard.exec", "View executive dashboard"),
    ("Dashboards", "dashboard.ops", "View operational dashboard"),
    ("Dashboards", "dashboard.risk", "View risk posture dashboard"),
    ("Dashboards", "dashboard.executive_view", "Executive View AI analytics"),
    ("Governance", "audit.view", "View audit trail"),
    ("Governance", "audit.export", "Export audit trail"),
    ("Governance", "methodology.version", "Version the methodology"),
    ("Governance", "reg.report", "Generate regulatory reports & registers"),
    ("Administration", "admin.email", "Configure email service & integration"),
    ("Administration", "admin.aikeys", "Manage AI provider API keys"),
    ("Administration", "admin.users", "Manage users"),
    ("Administration", "admin.roles", "Manage roles & permissions"),
    ("Administration", "admin.integrations", "Manage integrations & API tokens"),
    ("Administration", "admin.webhooks", "Manage webhooks & procurement triggers"),
    ("Administration", "admin.config", "Manage system configuration & risk parameters"),
    ("Vendor Portal", "portal.self", "Vendor self-service portal"),
]

_BUYER = [
    "engagement.view", "engagement.create", "engagement.edit", "engagement.publish",
    "engagement.autopilot", "vendor.view", "vendor.edit", "finding.view",
    "finding.manage", "acceptance.manage", "intel.financial", "intel.reputation",
    "intel.contract", "intel.evidence", "lifecycle.fourthparty", "lifecycle.documents",
    "lifecycle.monitoring", "lifecycle.reassess", "lifecycle.offboard",
    "lifecycle.certs", "lifecycle.evidence", "intel.ratings", "intel.sanctions",
    "lifecycle.cap", "lifecycle.performance", "lifecycle.obligations", "lifecycle.bia",
    "lifecycle.incident", "dashboard.trending", "notify.view", "notify.inbound",
    "dashboard.exec", "dashboard.ops", "dashboard.risk", "dashboard.executive_view",
    "audit.view",
]
_BUYER = _BUYER + ["reg.view", "reg.assess", "integrity.view", "incident.view"]
_VRM = _BUYER + ["engagement.review", "vendor.critical", "reg.report",
                 "audit.export", "methodology.version", "integrity.manage", "incident.manage"]
_VRM = [p for p in _VRM if p not in ("engagement.create", "engagement.edit",
                                     "engagement.publish", "vendor.edit")]

# Controller: assigns engagements to assessors, oversees the action plan.
_CONTROLLER = ["engagement.view", "engagement.assign", "engagement.review",
               "vendor.view", "finding.view", "finding.manage", "finding.delete",
               "acceptance.manage", "lifecycle.documents", "notify.view",
               "dashboard.exec", "dashboard.ops", "dashboard.risk",
               "dashboard.trending", "dashboard.executive_view", "audit.view", "audit.export",
               "reg.view", "reg.assess", "integrity.view", "integrity.manage", "incident.manage"]

_EXEC = ["vendor.view", "finding.view", "incident.view", "reg.view",
         "integrity.view", "audit.view"]

SYSTEM_ROLES = {
    "admin": ("Administrator", "#5C2A1A",
              "Full platform access, oversight, methodology & override.", "ALL"),
    "buyer": ("Buyer / Business Lead", "#1A4D3C",
              "Owns the engagement first contact to published report.", _BUYER),
    "vrm": ("Assessor", "#1E3A5C",
            "Reviews HIGH/ELEVATED engagements, validates, signs off.", _VRM),
    "controller": ("Controller", "#7A4E2D",
                   "Assigns engagements to assessors and oversees the action plan.", _CONTROLLER),
    "exec": ("Executive Management", "#2C2A4A",
             "Board / executive oversight — read-only across the estate, dashboards, board pack and evidence.", _EXEC),
    "vendor": ("Vendor / Supplier", "#6B7280",
               "Self-service: DDQ, evidence, own status.",
               ["portal.self", "engagement.edit", "finding.view"]),
}


def seed(session: Session) -> None:
    """Idempotent seed of permissions, system roles, and a default admin."""
    existing = {p.key for p in session.scalars(select(Permission)).all()}
    for cat, key, label in PERMISSIONS:
        if key not in existing:
            session.add(Permission(key=key, label=label, category=cat))
    session.flush()

    all_perms = {p.key: p for p in session.scalars(select(Permission)).all()}
    have_roles = {r.key for r in session.scalars(select(Role)).all()}
    for rkey, (label, color, desc, perms) in SYSTEM_ROLES.items():
        if rkey in have_roles:
            continue
        role = Role(key=rkey, label=label, description=desc, color=color,
                    is_system=True)
        keys = list(all_perms) if perms == "ALL" else perms
        role.permissions = [all_perms[k] for k in keys if k in all_perms]
        session.add(role)
    session.flush()

    if not session.scalars(select(User).where(User.username == "admin")).first():
        from .secrets import get_secret, is_production
        admin_role = session.scalars(select(Role).where(Role.key == "admin")).first()
        admin_user = get_secret("BRO_ADMIN_USERNAME", default="admin")
        admin_email = get_secret("BRO_ADMIN_EMAIL", default="admin@bro.example")
        admin_pw = get_secret("BRO_ADMIN_PASSWORD")
        if is_production():
            # Never seed a guessable admin in production.
            if not admin_pw or admin_pw == "admin" or len(admin_pw) < 12:
                raise RuntimeError(
                    "Refusing to seed the platform admin in production without a strong "
                    "BRO_ADMIN_PASSWORD (>= 12 chars). Set it via env/secret store.")
        elif not admin_pw:
            admin_pw = "admin"
            print("WARNING: seeding default admin/admin (dev only). "
                  "Set BRO_ADMIN_PASSWORD for any shared environment.")
        session.add(User(username=admin_user, full_name="Platform Admin",
                         email=admin_email,
                         password_hash=hash_password(admin_pw),
                         role_id=admin_role.id))
    session.commit()


def has_permission(user: User, perm_key: str) -> bool:
    """True if the user's role grants perm_key (admin ALL implies everything)."""
    if user.role is None:
        return False
    return any(p.key == perm_key for p in user.role.permissions)
