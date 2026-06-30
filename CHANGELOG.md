# Changelog — Brata (BRO Risk Oracle)

All notable changes to this platform are documented here.
Format: [Keep a Changelog](https://keepachangelog.com) · Versioning: [SemVer](https://semver.org)
(MAJOR = breaking schema/API change · MINOR = new features · PATCH = fixes only)

## [4.5.1] — 2026-06-21 · Methodology folder governs BRO Chat & ProAssess

### Changed
- **Single methodology source for all AI assessors.** BRO Chat and ProAssess are
  now guided by the firm's methodology in the **Methodology folder** (the active
  `methodology_doc` rows / Methodology Library). The LangGraph 8-stage ProAssess
  representation previously used a static built-in constant; it now resolves the
  same `methodology.methodology_directive(session)` the conversational and
  autonomous AI paths use, so every AI assessor is governed by one authoritative
  methodology (with an identical best-practice fallback when the folder is empty).
- **Navigation.** The **Methodology** item is moved to the top of the menu
  (admin-only); the **Documents** item moves down into Monitor & Manage. This
  reflects that the Methodology folder governs assessment behaviour, while
  Documents holds per-vendor evidence.

### Docs
- SOP (SOP-08, SOP-13) updated: ProAssess and BRO Chat are explicitly governed by
  the Methodology folder; the Documents-vs-Methodology distinction is documented.
- Technical documentation (§3.2) updated with the methodology-grounding data path
  and the resolver functions across the conversational, autonomous and LangGraph
  paths.

## [4.5.0] — 2026-06-15 · Dashboards, Learnings, reports & BRO Chat UX

### Added
- **Management Dashboards** — a new top-level tab with five subtabs (Executive,
  Risk, Operations, Performance, Learning & AI) rendering live portfolio
  intelligence as KPI cards and distribution bars over existing data.
- **Learnings** — a durable, cross-assessment log of what the system has learned,
  to guide future actions. Learnings are captured automatically from completed
  assessments (deterministic derivation of risk patterns, control-effectiveness,
  evidence-quality and precedent signals) or added by hand, with category filters,
  confidence, origin (auto/human) and a reuse counter. New `platform_learnings`
  store + endpoints under `/api/v2/learnings` and `.../capture-learnings`.
- **Vendor 360 → Assessment reports** — a new section listing every engagement
  with a printable, detailed assessment report (summary, assessment history,
  findings register, documents). New `/api/v2/engagements/{id}/assessment-report`.
- **BRO Chat → PDF Report** — an interim report button that builds an AI narrative
  of the assessment so far plus an annex of every document and input the user
  submitted (deterministic fallback when AI is unavailable). New
  `/api/v2/agent/sessions/{id}/interim-report`.

### Changed
- **BRO Chat UX — agent persona highlighting.** The active specialist is now
  clearly highlighted in the Team-on-call rail (colour border + pulsing "on call"
  badge), and each message carries a richer persona header with a colour-accented
  bubble matching the agent.
- **BRO Chat — AI health banner.** The chat now shows whether the live AI engine
  is reachable and, if not, exactly why (e.g. no `ANTHROPIC_API_KEY`), so AI
  availability is transparent rather than a silent fallback.
- **Navigation.** Documents, Dashboards and Learnings moved to the top of the
  sidebar for quick access; the legacy single dashboard is now "Snapshot".

### Notes
- The AI-call path was rechecked and is correct: with a key it reaches the
  provider; a missing/invalid key surfaces cleanly. "AI calls failing" is a
  deployment configuration issue (set `ANTHROPIC_API_KEY`), now made visible
  in-app via the BRO Chat health banner.
- Migration `platform_learnings`; AI narrative paths are deterministic-first and
  badged, with optional gateway enrichment when a key is present.

## [4.4.0] — 2026-06-15 · In-app Documentation & navigation fix

### Fixed
- **SLA Management & Performance Issues now appear in the sidebar.** The v4.3.0
  nav entries had been added to an unused config array; they are now wired into
  the real sidebar (Monitor & Manage group), so both views are reachable by click.

### Added
- **SOP** page (Documentation group): renders the live Standard Operating
  Procedure in-app, with a version/last-updated stamp, a **Print / Save PDF**
  action, and an **AI update** script that re-syncs the document to the current
  build (deterministic refresh injecting a changelog-driven "Recent platform
  updates" panel; gateway-enrichable when an LLM key is set).
- **Technical Details** page (Documentation group): same treatment for the
  Technical Design & Architecture document (Print / Save PDF + AI update).
- **Version Control** page (Documentation group): a release timeline showing
  update notes for every version, parsed from the changelog (newest first,
  current release flagged).
- New `platform_docs` store + endpoints under `/api/v2/platform-docs`
  (`{kind}`, `{kind}/ai-update`, `versions`); migration `platform_docs`.
- CSP now allows `frame-src 'self' blob:` so the in-app document viewer can
  render the SOP/TDA HTML in a sandboxed frame.

## [4.3.0] — 2026-06-12 · SLA Management & Performance Issues

### Added
- **SLA Management** (Performance Management). A new SLA register per engagement:
  service levels can be extracted from the linked contract, extracted from an
  uploaded document, or added manually; auto-extracted SLAs remain fully editable.
  Each SLA carries a description, minimum/maximum threshold, baseline and
  measurement window (monthly/quarterly). Measurements are entered per period —
  six months or four quarters — and each reading is evaluated met/breach against
  the threshold with a live status icon. An AI analysis summary (deterministic,
  gateway-enrichable) and an AI enquiry that answers from the engagement's SLA
  data sit alongside the register as a second sub-tab.
  - New models: `SLARecord`, `SLAMeasurement` (`SLA-xxxxxx`).
  - New endpoints under `/api/v2/slas` (list/create/edit/delete, measurements,
    extract, summary, enquiry).
- **Performance Issues** register (Performance Management). Mirrors the risk
  register (FindingRecord) data model — ID, title, description, category,
  severity, source, status, owner, raised-by, due date, suggested remediation,
  progress-notes timeline and risk acceptance — applied to vendor performance.
  Includes a by-severity summary strip, status/source/category filters,
  expandable detail drawers, a status workflow (Open → In Progress → In Review →
  Closed) and a **Raise from SLA breach** action that opens a linked issue with
  severity derived from the breached SLA.
  - New model: `PerformanceIssue` (`PIS-xxxxxx`).
  - New endpoints under `/api/v2/performance-issues` (list/create/edit/delete,
    summary, advance, note, raise-from-sla).
- Alembic migration `perf_sla_issues` (3 tables); 18 new endpoints (12 paths).
- Frontend: two new SPA views (`SLA Management`, `Performance Issues`) in the
  Monitor & Manage section, wired to the new API.

## [4.2.2] — 2026-06-12 · Management Chat prompt update
### Changed
- `management_chat` prompt (Board & Executive group) reworked: now briefs a CRO &
  Board over ALL portfolio data, with a structured answer format — headline →
  data insight (figures, vendor/engagement IDs, bands) → external events &
  firm impact → recommended action. 5–10 sentences, visual where it aids the
  analysis, offers elaboration / one-pager, conditional PESTLE. Prior 4–8
  sentence executive brief replaced.

## [4.2.1] — 2026-06-12 · Reliability & performance hardening
Code-review gap remediation. No breaking changes; all 438 functional tests green.
### Fixed / Changed
- **LLM call reliability (P0):** per-call timeout on all provider SDK clients
  (`BRO_LLM_TIMEOUT`, default 30s); bounded retry with full-jitter exponential
  backoff on transient errors (timeout/429/5xx); ordered failover across
  key-present providers (`BRO_LLM_RETRIES`, `BRO_LLM_FAILOVER`). A hung provider
  can no longer stall the worker.
- **SQLite concurrency (P1):** WAL journal mode + `busy_timeout=5000` +
  `synchronous=NORMAL` applied to every SQLite connection, so the monitoring
  scheduler and web requests no longer contend for a write lock.
- **Search performance (P1):** global search rewritten from full-table-scan +
  Python filtering to SQL-side `ilike` + `LIMIT` across all four entity types.
- **Observability (P2):** 36 silent `except: pass` blocks now emit one
  structured `log_json` line via `_obs_swallow` (never raises; control flow
  unchanged).
- **Payload size (P2):** `?slim=` mode on `/api/v2/vendors` and
  `/api/v2/engagements` (~36% smaller rows); eliminated an N+1 query in the
  vendor list (was one industries query per vendor; now one batched query).
- **Indexes (P2):** new Alembic revision `g6_fk_indexes` adds six composite
  indexes on hot FK lookup paths (engagement→vendor, finding→engagement,
  finding→(vendor,status), assessment→engagement, artefact→vendor,
  incident→vendor).
- **Monolith decomposition (P2, started):** new `app/routers/` package with a
  `RouterDeps` dependency-injection pattern; health/readiness/version endpoints
  extracted into `app/routers/health.py` as the reference implementation. The
  remaining domains follow the same shape (tracked for subsequent releases).

## [4.2.0] — 2026-06-10 · Interconnected Ecosystem & UX
### Added
- Global system-data search bar in the top bar (vendors, engagements, incidents, contracts, pages) with typeahead and deep-linking
- Connections page with REST API / Webhooks / MCP sub-tabs
- Schedules page surfacing every scheduled sweep (cadence, engine, status)
- Dump-to-Draft on forms (New Vendor, New Engagement, Exit plan): upload documents, AI fills feasible fields (deterministic fallback offline)
- Auto slideshow demo (▶ Demo) — 10-stage narrated value tour
- Build 2: platform notification engine — full catalogue of every notifiable event, all OFF by default, admin-configurable with audience routing
- Build 3: NOTABLE EVENT flag on incidents — always escalates to management (bypasses the off switch)
### Changed
- Records hyperlinked across pages (reclink/vlink); form alignment fixed (all inputs/textareas left-aligned)

## [4.1.0] — 2026-06-10 · Enterprise Hardening
### Added — Security pack
- Secrets-at-rest encryption for stored AI provider keys (Fernet via `BRO_SECRET_KEY`,
  `plain:`/`enc:` envelope, admin UI warning when unencrypted)
- Production mode (`BRO_ENV=production`): dev trust-header fails closed, HSTS enabled,
  strong `BRO_ADMIN_PASSWORD` and `BRO_SECRET_KEY` required at boot
- Security headers + CSP on all responses; login rate-limiting and account lockout
  with exponential backoff; upload validation (extension allowlist + magic bytes);
  `/healthz` and `/readyz` probes
### Added — AI governance pack
- AI call ledger (metadata only — no prompt/response content stored; PII-redacted errors)
  with admin view and daily call budget cap enforced before every model call
- Strict JSON validation of model output with one automatic repair retry
- Prompt-injection isolation of third-party document text (`<untrusted_document>` tags)
- `prompt_evals.py` golden-set harness over the prompt registry + deterministic engines
### Added — Platform pack
- Vendor list pagination (`limit`/`offset`); bulk CSV vendor import with preview→commit
- GitHub Actions CI; accessibility attributes; version-control framework (this file,
  `VERSION`, `release.sh`, tags)
### Fixed
- AI daily budget of 0 was ignored (0 is now a valid hard cap)

## [4.0.0] — 2026-06-10 · Consolidated Demo
- Viny AI exit-plan drafting; LangGraph ProAssess orchestration; editable agent
  personas + assessment rubric in AI Control; NVIDIA + admin-added custom LLM
  providers; collapsible Users admin section; 455-test regression baseline

## [Pre-4.0] — 2026 H1 (unversioned)
- Full TPRM lifecycle: registry, ProAssess 8-stage multi-agent assessments, DDQ/IRQ,
  financial due diligence (Vera), contracts (Matt), monitoring, sanctions/AML,
  scenario simulator with 4th-party impact, Supplier Trust Centre, dashboards,
  AI Control prompt registry, OIDC/JWT auth, scheduler
