## [4.11.0] — 2026-07-02 · Brain map — concentration replay (time slider)

### Added
- **Concentration replay**: a time slider and "Replay build-up" control on the
  entity brain map animate how the estate — and its concentration — formed over
  time, honestly dated from engagement start dates (record-creation timestamps
  are seed-time and were rejected as a signal). Scrubbing shows live vendor/link
  counts; undated entities remain visible throughout by design.
- `GET /api/v2/graph/network` now returns `since` per node/link and a `timeline`
  {min,max}; TDA section 10B and SOP-31 updated accordingly.
