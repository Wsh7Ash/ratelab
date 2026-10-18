# Usage — ratelab

```
ratelab run --url <URL> [options]
ratelab serve [--port <N>]
ratelab compare <baseline.json> <candidate.json> [--max-regress <PCT>]
```

Exit codes: **0** pass · **1** gate failed / regression detected · **2** usage error.

## run

### Profile options

| Flag | Default | Description |
|---|---|---|
| `--url <URL>` | *(required)* | target URL |
| `--profile <P>` | `constant` | `constant` \| `step` \| `spike` |
| `--duration <D>` | `10s` | run length: `500ms`, `10s`, `2m`, `1h`, bare number = seconds |
| `--rps <N>` | `10` | request rate (step: ramp start; spike: baseline) |
| `--rps-max <N>` | — | step: top of the ramp (required for `step`) |
| `--steps <N>` | `5` | step: number of equal segments (≥ 2) |
| `--spike-rps <N>` | — | spike: rate during the burst (required for `spike`) |
| `--spike-at <D>` | `0s` | spike: start offset |
| `--spike-for <D>` | `2s` | spike: burst length |
| `--concurrency <N>` | `64` | max in-flight requests (overflow is counted `throttled`) |
| `--timeout <D>` | `10s` | per-request timeout (timed-out requests count as failures) |
| `--json <FILE>` | — | write the full run (profile, meta, summary, gates) as JSON |

### Gate flags (exit 1 if violated)

| Flag | Unit | Checks |
|---|---|---|
| `--p50-max <MS>` | ms | median latency ≤ limit |
| `--p95-max <MS>` | ms | p95 latency ≤ limit |
| `--p99-max <MS>` | ms | p99 latency ≤ limit |
| `--error-rate-max <PCT>` | % | failed requests ≤ limit (boundary inclusive) |
| `--rps-min <N>` | req/s | achieved throughput ≥ limit |
| `--min-requests <N>` | count | sample count ≥ limit |

### Examples

```console
# CI gate: p99 budget + error budget + minimum throughput
$ ratelab run --url http://127.0.0.1:8080/ok --rps 100 --duration 5s \
    --p99-max 300 --error-rate-max 1 --rps-min 80 --json run.json

# Ramp test
$ ratelab run --url http://127.0.0.1:8080/ok --profile step \
    --rps 25 --rps-max 200 --steps 4 --duration 3s

# Burst test: baseline 20, jump to 500 for 1s starting at 2s
$ ratelab run --url http://127.0.0.1:8080/ok --profile spike \
    --rps 20 --spike-rps 500 --spike-at 2s --spike-for 1s --duration 5s
```

## serve

Bundled demo target on 127.0.0.1 so the whole tool works offline:

| Route | Behavior |
|---|---|
| `/ok` | 200 after 5ms |
| `/slow?ms=N` | 200 after N ms (default 250) |
| `/error` | always 500 |
| `/flaky` | every 3rd request 500, else 200 |
| `/bytes?size=N` | 200 with an N-byte body (default 1024) |
| anything else | 404 |

```console
$ ratelab serve --port 8080
ratelab demo target listening on http://127.0.0.1:8080
```

## compare

```console
$ ratelab compare baseline.json candidate.json --max-regress 10

ratelab compare
  baseline    http://127.0.0.1:8080/ok
  candidate   http://127.0.0.1:8080/ok
  threshold   +/- 40% counts as a regression

    metric                baseline    candidate   delta     verdict
    p50 (ms)              16.50       17.00       +3.0%     ok
    p95 (ms)              22.00       24.00       +9.1%     ok
    p99 (ms)              43.08       37.25       -13.5%    ok
    throughput (req/s)    99.34       111.07      +11.8%    ok
    error rate (%)        0.00        0.00        +0.0%     ok

  OK: no regression beyond 40%
exit=0
```

Verdicts are direction-aware: latency/error-rate rising is bad, throughput
dropping is bad; movements beyond the threshold print `FAIL: regressed metrics: …`
and exit 1.

## Run file shape (`--json`)

```json
{
  "tool": "ratelab",
  "version": "1.0.0",
  "startedAt": "2026-10-17T12:00:00.000Z",
  "profile": { "type": "constant", "durationMs": 3000, "segments": [{ "until": 3000, "rps": 100 }] },
  "meta": { "url": "...", "wallMs": 3021, "concurrency": 64, "maxInflight": 6, "throttled": 0 },
  "summary": {
    "count": 300, "failed": 0, "errorRate": 0, "timeouts": 0,
    "statusCounts": { "200": 300 },
    "latency": { "min": 6, "max": 54, "mean": 16.9, "stddev": 4.9, "p50": 16.5, "p90": 18.1, "p95": 22, "p99": 43.1 },
    "throughput": { "wallMs": 3021, "rps": 99.3, "bytesTotal": 6000, "mibPerSec": 0.002 }
  },
  "gates": { "passed": true, "checks": [] }
}
```

`compare` consumes exactly this file.