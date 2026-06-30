"""Shared dependency injector for routers.

create_app builds one RouterDeps and hands it to each router's factory. This
replaces closure-capture of create_app's locals with explicit injection, which
is what lets endpoints live in their own modules and be unit-tested in isolation.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable


@dataclass
class RouterDeps:
    db: Callable          # () -> Session  (FastAPI dependency)
    actor: Callable       # () -> User     (FastAPI dependency)
    require: Callable     # (perm: str) -> dependency
    audit: Callable       # (s, action, actor_name, detail) -> None
    platform_version: Callable  # () -> str
