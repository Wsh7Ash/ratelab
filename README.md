# ratelab

**Offline-first HTTP load testing CLI** — open-model scheduling, latency percentiles,
SLO gate checks, and run-to-run regression compare. Standard library only, no
dependencies, works entirely against localhost or any target you are authorized to test.

```console
$ ratelab run --url http://127.0.0.1:8080/ok --rps 100 --duration 3s \
    --p99-max 500 --error-rate-max 1 --rps-min 50

ratelab report
  target      http://127.0.0.1:8080/ok
  profile     constant (100 req/s) for 3.0s, concurrency 64
  requests    300 total, 0 failed (0.00%), 0 timeout(s)
  wall        3.02s   achieved 99.3 req/s   0.000 MiB/s
  scheduling  max in-flight 6/64

  latency (ms)
    min 6.0   p50 16.5   p90 18.1   p95 22.0   p99 43.1   max 54.0   mean 16.9   sd 4.9

  statuses
    200: 300

  gates
    PASS  p99Max <= 500 ms (actual 43.08)
    PASS  errorRateMax <= 1 % (actual 0.00)
    PASS  rpsMin <= 50 req/s (actual 99.34)
exit=0
```

## Why

CI wants a one-line performance check: *did p99 stay under the budget, did the
error rate stay under 1%?* ratelab turns a load profile into an **exit code**:
`0` pass, `1` a gate failed, `2` usage error. Save runs with `--json` and use
`ratelab compare` to catch regressions between two builds.

## Features

- **Profiles**: `constant`, `step` (linear ramp), `spike` (baseline → burst → baseline).
- **Open-model scheduling**: requests are dispatched on a timeline, not waiting
  for the previous response, so slow responses don't silently lower the offered load.
- **Gates**: `--p50-max/--p95-max/--p99-max`, `--error-rate-max`, `--rps-min`,
  `--min-requests` — enforce SLOs in CI via exit codes.
- **Compare**: baseline vs candidate with a regression threshold
  (`--max-regress`), direction-aware for throughput vs latency vs error rate.
- **Bundled demo target**: `ratelab serve` runs `/ok`, `/slow`, `/error`,
  `/flaky`, `/bytes` on 127.0.0.1 so everything works offline.
- **Zero dependencies**: Node 20+ standard library only.

## Quick start

```console
$ git clone https://github.com/Wsh7Ash/ratelab && cd ratelab
$ node src/cli.js serve --port 8080 &          # demo target
$ npm test                                       # 53 tests
$ node src/cli.js run --url http://127.0.0.1:8080/ok \
    --profile step --rps 25 --rps-max 200 --steps 4 --duration 3s --json step.json
$ node src/cli.js compare base.json step.json --max-regress 40
```

## Documentation

- [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md) — requirements and scope
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — modules and data flow
- [docs/USAGE.md](docs/USAGE.md) — full flag reference
- [RESULTS.md](RESULTS.md) — validation evidence and demo output
- [SECURITY.md](SECURITY.md) — responsible-use policy

## Requirements

Node.js **≥ 20** (uses built-in `fetch`/`AbortSignal.timeout`, `node --test`).
No npm dependencies.

## License

MIT — see [LICENSE](LICENSE).