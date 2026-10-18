# Changelog

All notable changes to ratelab are documented here.

## 1.0.0 — 2026-10-17

Initial release.

### Added

- **Profiles**: `constant`, `step` (linear ramp in equal steps), `spike`
  (`--spike-rps` / `--spike-at` / `--spike-for`), with `500ms`/`10s`/`2m`/`1h`
  duration parsing.
- **Open-model runner**: timeline dispatch decoupled from responses (no
  coordinated omission relative to the schedule), `--concurrency` cap with
  throttling counters, per-request timeout via `AbortSignal.timeout`.
- **Statistics**: exact interpolated percentiles (p50/p90/p95/p99), mean,
  sample stddev, status/failure/timeout bucketing, throughput and byte rates.
- **SLO gates**: `--p50-max`, `--p95-max`, `--p99-max`, `--error-rate-max`,
  `--rps-min`, `--min-requests` — any violation exits 1; gates fail closed.
- **Run compare**: `ratelab compare a.json b.json --max-regress <PCT>` with
  direction-aware verdicts and regression exit code.
- **Demo target**: `ratelab serve` (`/ok`, `/slow`, `/error`, `/flaky`, `/bytes`)
  bound to 127.0.0.1 for offline testing.
- **Reports**: text table on stdout, full machine-readable run via `--json`.
- Test suite (53 tests, `node --test`), CI workflow for Node 20/22/24,
  MIT license, docs (`PROJECT_SPEC`, `ARCHITECTURE`, `USAGE`, `SECURITY`).