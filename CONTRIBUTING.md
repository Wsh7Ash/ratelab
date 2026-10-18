# Contributing to ratelab

Thanks for helping improve ratelab.

## Development

```console
$ npm test              # node --test, all suites, no dependencies
$ node --check src/*.js # syntax gate
```

The project is intentionally **standard-library only** — please keep it that way
(a load tool should not ship a supply chain). Formatting: 2-space indent, double
quotes, semicolons, ES modules.

## Layout

| Area | File(s) | Notes |
|---|---|---|
| Scheduling | `src/runner.js` | open-model timeline, concurrency cap, timeouts |
| Profiles | `src/profile.js` | `constant`/`step`/`spike`, duration parsing |
| Stats | `src/stats.js` | pure functions — percentile convention is R-7, keep it stable |
| Gates | `src/gates.js` | threshold → `{passed, checks}` |
| Compare | `src/compare.js` | direction-aware regression verdicts |
| Rendering | `src/report.js` | text only; JSON comes from `cli.js` |
| Demo target | `src/server.js` | also the test fixture server |

## Guidelines

- New features need tests: unit tests for pure logic, an integration/CLI test for
  anything that changes exit codes or output format.
- Exit-code semantics (0/1/2) are part of the public contract — changing them is
  a breaking change; update `docs/USAGE.md` and `CHANGELOG.md`.
- Timing tests must stay robust on slow CI: assert structure/margins, never exact
  request counts or exact latencies.
- Gate defaults should fail *closed*: a missing value or empty summary must not
  silently pass a configured gate.

## Commits

Small, described-by-purpose commits. Reference the issue if there is one.