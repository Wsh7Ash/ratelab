# Project Spec — ratelab

## Summary

An offline-first HTTP load testing CLI (Node 20+, zero dependencies) that executes
load profiles against a target URL, reports latency/throughput statistics, enforces
SLO gates via exit codes, and compares saved runs to catch performance regressions.

Category: **load-testing** (first use in this factory — see the daily pipeline's
category rotation notes).

## Problem

CI pipelines want a one-line performance check: "did p99 stay under 300ms and the
error rate under 1% on the staging box?" Existing heavyweight tools require agents,
daemons, or cloud accounts. ratelab makes the check a command with an exit code.

## Goals

1. **Gates as exit codes.** Any threshold violation ⇒ exit 1, ready for CI.
2. **Honest load.** Open-model scheduling: the request timeline is independent of
   response times, and any concurrency-induced throttling is reported, not hidden.
3. **Offline by default.** A bundled demo server (`serve`) exercises every feature
   on 127.0.0.1 — tests and demos never need the network.
4. **Regression compare.** Two saved runs, one threshold, direction-aware verdicts
   (lower latency better, higher throughput better, lower error rate better).
5. **Zero dependencies.** Node standard library only — a measuring instrument
   should not ship a supply chain.

## Non-goals

- Not a distributed load generator (single process, ~1000 req/s practical ceiling
  from the 1ms scheduler tick).
- No browser-level (JS/DOM) workloads — plain HTTP requests only.
- No HAR/gRPC/WebSocket protocols in v1.
- Not a monitoring/alerting system; it produces snapshots, not time series.

## CLI surface (v1.0.0)

| Command | Purpose |
|---|---|
| `ratelab run` | execute a profile, print report, evaluate gates, exit 0/1 |
| `ratelab serve` | start the local demo target (`/ok`, `/slow`, `/error`, `/flaky`, `/bytes`) |
| `ratelab compare` | baseline vs candidate JSON with `--max-regress`, exit 0/1 |

## Profiles

| Profile | Meaning |
|---|---|
| `constant` | flat `--rps` for `--duration` |
| `step` | linear ramp `--rps` → `--rps-max` over `--steps` equal segments |
| `spike` | baseline `--rps`, jumping to `--spike-rps` at `--spike-at` for `--spike-for` |

Durations parse `500ms`, `10s`, `2m`, `1h` (bare number = seconds).

## Acceptance criteria

- `npm test` (`node --test`) passes with 0 failures on Node 20/22/24.
- A run against `/ok` with sane gates exits 0; against `/error` exits 1.
- `compare` of a run with itself is a pass; a 10× worse p99 fails at default threshold.
- Reports are plain text on stdout; `--json` writes a parseable run file.
- No network access required for any test or demo.

## Known limitations

- Single-process scheduler: practical ceiling ≈ 1000 req/s (1ms tick), burst catch-up
  capped at 50 dispatches per tick.
- Latency distributions are summarized as percentiles from a sorted array (O(n log n))
  — exact, but not streaming/reservoir-based for multi-million-sample runs.
- Open model means achieved rate can exceed `--rps` if the target is slower than the
  line discipline; scheduling throttling is counted in `meta.throttled`.