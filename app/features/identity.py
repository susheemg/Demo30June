"""
Enterprise identity: OIDC single sign-on + SCIM 2.0 provisioning.

SSO (OIDC / OAuth2 authorization-code):
  Works with Okta, Microsoft Entra ID, Ping, Auth0, Google Workspace, etc.
  Configure via env / secret store:
    BRO_OIDC_ISSUER         e.g. https://login.microsoftonline.com/<tenant>/v2.0
    BRO_OIDC_CLIENT_ID
    BRO_OIDC_CLIENT_SECRET  (secret)
    BRO_OIDC_REDIRECT_URI   https://app.example.com/auth/oidc/callback
    BRO_OIDC_SCOPES         default "openid email profile groups"
    BRO_OIDC_GROUPS_CLAIM   default "groups"
    BRO_OIDC_ROLE_MAP       JSON, IdP group -> Brata role key,
                            e.g. {"TPRM-Admins":"admin","TPRM-Assessors":"assessor"}
    BRO_OIDC_DEFAULT_ROLE   role for users with no mapped group (default "viewer")

SCIM 2.0 (RFC 7643/7644) lets the IdP push user lifecycle (create/activate/
deactivate). Protected by a bearer token the IdP is configured with:
    BRO_SCIM_TOKEN          (secret)

This module holds pure, testable helpers; the HTTP routes live in bro_app where
the DB session, token issuance and audit log are available.
"""
from __future__ import annotations

import json
import os
import time
from typing import Optional

import httpx
import jwt

from .secrets import get_secret

_disc_cache: dict = {}


# ------------------------- OIDC -------------------------
def oidc_enabled() -> bool:
    return bool(get_secret("BRO_OIDC_ISSUER") and get_secret("BRO_OIDC_CLIENT_ID"))


def _cfg() -> dict:
    return {
        "issuer": get_secret("BRO_OIDC_ISSUER"),
        "client_id": get_secret("BRO_OIDC_CLIENT_ID"),
        "client_secret": get_secret("BRO_OIDC_CLIENT_SECRET"),
        "redirect_uri": get_secret("BRO_OIDC_REDIRECT_URI"),
        "scopes": get_secret("BRO_OIDC_SCOPES", default="openid email profile groups"),
        "groups_claim": get_secret("BRO_OIDC_GROUPS_CLAIM", default="groups"),
        "default_role": get_secret("BRO_OIDC_DEFAULT_ROLE", default="vendor"),
    }


def discover() -> dict:
    """Fetch and cache the provider's OIDC discovery document."""
    issuer = get_secret("BRO_OIDC_ISSUER")
    if not issuer:
        raise RuntimeError("OIDC not configured")
    if issuer in _disc_cache:
        return _disc_cache[issuer]
    url = issuer.rstrip("/") + "/.well-known/openid-configuration"
    doc = httpx.get(url, timeout=10).raise_for_status().json()
    _disc_cache[issuer] = doc
    return doc


def auth_url(state: str) -> str:
    c = _cfg()
    d = discover()
    from urllib.parse import urlencode
    q = urlencode({
        "client_id": c["client_id"], "response_type": "code",
        "scope": c["scopes"], "redirect_uri": c["redirect_uri"], "state": state,
    })
    return f"{d['authorization_endpoint']}?{q}"


def exchange_code(code: str) -> dict:
    c = _cfg()
    d = discover()
    resp = httpx.post(d["token_endpoint"], timeout=15, data={
        "grant_type": "authorization_code", "code": code,
        "redirect_uri": c["redirect_uri"],
        "client_id": c["client_id"], "client_secret": c["client_secret"],
    })
    resp.raise_for_status()
    return resp.json()


def verify_id_token(id_token: str) -> dict:
    """Verify signature (via the provider JWKS), audience and issuer."""
    c = _cfg()
    d = discover()
    signing_key = jwt.PyJWKClient(d["jwks_uri"]).get_signing_key_from_jwt(id_token)
    return jwt.decode(id_token, signing_key.key,
                      algorithms=d.get("id_token_signing_alg_values_supported", ["RS256"]),
                      audience=c["client_id"], issuer=d["issuer"])


def claims_to_identity(claims: dict) -> dict:
    """Pull a normalised identity (username/email/name/groups/role) from claims."""
    c = _cfg()
    groups = claims.get(c["groups_claim"]) or []
    if isinstance(groups, str):
        groups = [groups]
    return {
        "username": claims.get("preferred_username") or claims.get("email") or claims.get("sub"),
        "email": claims.get("email"),
        "full_name": claims.get("name") or claims.get("preferred_username"),
        "groups": groups,
        "role": map_groups_to_role(groups),
    }


def map_groups_to_role(groups: list[str]) -> str:
    c = _cfg()
    raw = get_secret("BRO_OIDC_ROLE_MAP", default="{}")
    try:
        mapping = json.loads(raw)
    except ValueError:
        mapping = {}
    for g in groups:
        if g in mapping:
            return mapping[g]
    return c["default_role"]


def new_state() -> str:
    return jwt.encode({"n": os.urandom(8).hex(), "iat": int(time.time())},
                      get_secret("BRO_SECRET_KEY", default="dev"), algorithm="HS256")


# ------------------------- SCIM 2.0 -------------------------
def scim_enabled() -> bool:
    return bool(get_secret("BRO_SCIM_TOKEN"))


def scim_token_ok(authorization: Optional[str]) -> bool:
    tok = get_secret("BRO_SCIM_TOKEN")
    if not tok or not authorization:
        return False
    parts = authorization.split(" ", 1)
    return len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].strip() == tok


def user_to_scim(u, base_url: str = "") -> dict:
    """Render a Brata User as a SCIM 2.0 User resource."""
    return {
        "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
        "id": str(u.id),
        "userName": u.username,
        "name": {"formatted": u.full_name or u.username},
        "displayName": u.full_name or u.username,
        "emails": ([{"value": u.email, "primary": True}] if getattr(u, "email", None) else []),
        "active": bool(u.is_active),
        "roles": ([{"value": u.role.key}] if getattr(u, "role", None) else []),
        "meta": {"resourceType": "User", "location": f"{base_url}/scim/v2/Users/{u.id}"},
    }


def scim_extract(body: dict) -> dict:
    """Pull the fields we persist from an inbound SCIM User payload."""
    emails = body.get("emails") or []
    email = None
    if emails:
        email = next((e.get("value") for e in emails if e.get("primary")), emails[0].get("value"))
    name = body.get("name") or {}
    roles = body.get("roles") or []
    return {
        "username": body.get("userName"),
        "email": email,
        "full_name": name.get("formatted") or body.get("displayName") or body.get("userName"),
        "active": body.get("active", True),
        "role_hint": (roles[0].get("value") if roles else None),
    }


def scim_list_response(resources: list[dict]) -> dict:
    return {
        "schemas": ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        "totalResults": len(resources),
        "startIndex": 1,
        "itemsPerPage": len(resources),
        "Resources": resources,
    }


def scim_error(status: int, detail: str) -> dict:
    return {"schemas": ["urn:ietf:params:scim:api:messages:2.0:Error"],
            "status": str(status), "detail": detail}
