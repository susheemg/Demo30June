"""APIRouter modules — the target structure for decomposing the bro_app monolith.

Gap-7 remediation pattern. Each router is a self-contained domain module that
takes its shared dependencies (db session, auth, audit) via a small injector
object rather than closing over create_app's local scope. The `health` router
below is the reference implementation; remaining domains (vendors, engagements,
assessments, findings, incidents, contracts, monitoring, exit, ai, admin)
follow the same shape and are mounted the same way.
"""
