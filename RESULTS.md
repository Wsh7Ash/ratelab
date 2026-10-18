# Results

## Environment

- OS: Windows 11 (Git Bash), Node.js v24.13.0, npm bundled
- Network: loopback only — every run targeted the bundled `ratelab serve` demo
  target (127.0.0.1), no external hosts
- Dependencies installed: **none** (standard library only)

## Validation performed

1. Syntax gate: `node --check` on all 8 source modules — clean.
2. Full unit + integration + CLI test suite via `npm test` (`node --test`).
3. Live demos of all three subcommands (`run` ×4 profiles/targets, `serve`,
   `compare`) with exit codes recorded.

## Commands executed

```console
$ node --check src/*.js                     # all 8 modules clean
$ npm test                                   # npm test → node --test
$ node src/cli.js serve --port 8941 &
$ node src/cli.js run --url http://127.0.0.1:8941/ok --rps 100 --duration 3s \
    --concurrency 64 --p99-max 500 --error-rate-max 1 --rps-min 50 --json results/run-ok.json
$ node src/cli.js run --url http://127.0.0.1:8941/error --rps 50 --duration 2s \
    --error-rate-max 1 --json results/run-error.json
$ node src/cli.js run --url http://127.0.0.1:8941/ok --profile step \
    --rps 25 --rps-max 200 --steps 4 --duration 3s --json results/run-step.json
$ node src/cli.js run --url http://127.0.0.1:8941/flaky --rps 60 --duration 2s \
    --error-rate-max 1 --json results/run-flaky.json
$ node src/cli.js compare results/run-ok.json results/run-step.json --max-regress 40
```

## Observed result

### Tests

`npm test` → **53 tests, 53 pass, 0 fail** (≈ 6.9s wall, exit 0), covering:
stats (12), profile (15), gates (8), compare (9), runner integration (8),
CLI end-to-end (7 incl. real `serve` startup).

### Demo: healthy target — gates pass, exit 0

```
requests    300 total, 0 failed (0.00%), 0 timeout(s)
wall        3.02s   achieved 99.3 req/s
latency (ms): min 6.0  p50 16.5  p90 18.1  p95 22.0  p99 43.1  max 54.0
gates
  PASS  p99Max <= 500 ms (actual 43.08)
  PASS  errorRateMax <= 1 % (actual 0.00)
  PASS  rpsMin <= 50 req/s (actual 99.34)
exit=0
```

### Demo: failing target — gate violation, exit 1 (/error)

```
requests    100 total, 100 failed (100.00%)   statuses: 500: 100
gates
  FAIL  errorRateMax <= 1 % (actual 100.00)
exit=1
```

### Demo: flaky target — partial failures caught, exit 1

```
requests    120 total, 42 failed (35.00%)     statuses: 200: 78  500: 42
gates
  FAIL  errorRateMax <= 1 % (actual 35.00)
exit=1
```

### Demo: step ramp (25 → 200 rps in 4 steps, 3s)

```
requests    336 total, 0 failed (0.00%)   achieved 111.1 req/s   max in-flight 10/64
exit=0
```

### Demo: compare (constant run vs step run, threshold 40%)

```
p50 16.50→17.00 (+3.0%, ok)   p95 22.00→24.00 (+9.1%, ok)
p99 43.08→37.25 (−13.5%, ok)  rps 99.34→111.07 (+11.8%, ok)
error rate 0.00→0.00 (ok)     →  OK: no regression beyond 40%  (exit=0)
```

A deliberately regressed candidate (p99 ×10, rps −70%, error rate 0 → 25%) in
the test suite correctly exits 1 at the default 10% threshold.

## Generated artifacts

| File | Contents |
|---|---|
| `results/run-ok.txt` / `.json` | healthy-target run + gates (exit 0) |
| `results/run-error.txt` / `.json` | all-500 run, gate FAIL (exit 1) |
| `results/run-flaky.txt` / `.json` | 35% error-rate run, gate FAIL (exit 1) |
| `results/run-step.txt` / `.json` | ramp run (exit 0) |
| `results/compare-step-vs-ok.txt` | regression comparison (exit 0) |

## Known limitations (honest accounting)

- Scheduler ceiling ≈ 1000 req/s (1ms tick granularity, 50-dispatch burst cap);
  `meta.throttled` reports when `--concurrency` capped the offered load.
- Windows loopback carries ~6–17ms of baseline HTTP latency here — numbers above
  measure the stack, not "the internet".
- Percentiles are computed from the full sorted sample array (exact, not streaming).
- Gates evaluate the single run snapshot; there is no time-series windowing.

## Bug found and fixed during validation

CLI tests originally used `spawnSync` while the demo server lived in the same
test process: the blocked event loop meant the child's requests could never be
answered and everything hung to the 10s timeout. The test harness now spawns
asynchronously (`tests/cli.test.js`), and the suite runs green in ~6.9s.