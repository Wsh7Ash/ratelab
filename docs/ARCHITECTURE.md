# Architecture — ratelab

## Module map

```
src/
  cli.js      argument parsing, subcommand dispatch, exit codes
  profile.js  duration parsing + profile → piecewise schedule [{until, rps}]
  runner.js   open-model scheduler + per-request sampling
  stats.js    pure statistics (percentiles, mean/sd, summarize)
  gates.js    SLO gate evaluation against a summary
  compare.js  baseline-vs-candidate regression logic
  report.js   text renderers for run reports and comparisons
  server.js   bundled demo target (also used by the test suite)
tests/        node:test suites for every module + CLI end-to-end
```

## Data flow

```
CLI flags
  └─ buildProfile()      → { type, durationMs, segments:[{until,rps}] }
       └─ runLoad()      → { samples:[{start,ms,status,err,bytes,failed}], meta }
            └─ summarize(samples, wallMs)
                 → { count, failed, errorRate, timeouts, statusCounts,
                     latency:{min,mean,sd,p50,p90,p95,p99,max}, throughput:{rps,...} }
                 ├─ evaluateGates(summary, gates) → { passed, checks[] }   → exit 0/1
                 └─ formatRun() / JSON file
                                                   compareRuns(a, b) → exit 0/1
```

Everything downstream of `summarize` is a **pure function** over a plain object;
`{summary}` round-trips through `--json`, which is exactly what `compare` reads.

## Scheduler (runner.js)

Open model with a monotonic wall-clock timeline:

1. Schedule length comes from the last segment's `until`.
2. Each loop tick computes the target rate for the current elapsed time
   (`rpsAt`), converts it to an inter-arrival interval (`1000/rps` ms), and
   dispatches catch-up requests if the clock got ahead (capped at 50/tick).
3. When the in-flight set is at `--concurrency`, extra dispatches are counted
   as `throttled` instead of being silently queued.
4. Each dispatch fires `fetch` with `AbortSignal.timeout`, records start/finish,
   status, bytes, and error kind into a sample. Failure = network error,
   missing status, or HTTP ≥ 400.
5. After the schedule ends, outstanding requests are awaited (bounded by
   `settleMs`) and `meta.wallMs` covers the whole span.

Design consequences:

- **No coordinated-omission discount**: the timeline doesn't stretch when the
  target slows down — slow responses push samples up the latency distribution
  instead of reducing offered load.
- **Timeouts are honest**: a hung request eventually lands in the samples as
  `err: "timeout"` and counts against the error-rate gate.

## Statistics (stats.js)

- Percentiles use linear interpolation between order statistics (R-7 /
  Excel `PERCENTILE` convention) over an ascending sort — deterministic and
  exact for the sample set.
- `stddev` is the sample (n−1) standard deviation.
- Status buckets: `200`-style numeric keys, plus `error` (transport failure)
  and `timeout` keys for requests with no status.

## Regression comparison (compare.js)

Five metrics — p50/p95/p99 (lower better), rps (higher better), error rate
(lower better). Each row gets a signed delta %, then a *useful-direction*
projection: a metric "regresses" when it moves the wrong way by more than
`maxRegressPct`. Absent denominators (baseline = 0) report `deltaPct: null`
and count any worsening as a full regression.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | all gates passed / no regression |
| 1 | at least one gate failed, or compare found a regression |
| 2 | usage error (bad flag, missing value, unknown command) |