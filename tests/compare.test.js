import test from "node:test";
import assert from "node:assert/strict";
import { compareRuns } from "../src/compare.js";

const run = ({ p50 = 20, p95 = 60, p99 = 80, rps = 100, errorRate = 0.01, url = "http://x" } = {}) => ({
  meta: { url },
  summary: {
    count: 1000, failed: 10, errorRate, timeouts: 0,
    statusCounts: { 200: 990, 500: 10 },
    latency: { min: 5, max: 120, mean: 30, stddev: 15, p50, p90: p95 - 10, p95, p99 },
    throughput: { wallMs: 10_000, rps, bytesTotal: 0, mibPerSec: 0 },
  },
});

test("identical runs have no regressions", () => {
  const r = compareRuns(run(), run());
  assert.equal(r.passed, true);
  assert.equal(r.regressions, 0);
  assert.ok(r.rows.every((row) => row.verdict === "ok"));
});

test("large p99 increase is a regression", () => {
  const r = compareRuns(run({ p99: 80 }), run({ p99: 200 }));
  assert.equal(r.passed, false);
  assert.deepEqual(r.regressedMetrics, ["p99"]);
  const row = r.rows.find((x) => x.key === "p99");
  assert.ok(row.deltaPct > 100);
});

test("small changes within threshold stay ok", () => {
  const r = compareRuns(run({ p99: 100 }), run({ p99: 105 }), { maxRegressPct: 10 });
  assert.equal(r.passed, true);
  assert.equal(r.rows.find((x) => x.key === "p99").verdict, "ok");
});

test("latency improvements are labelled improved", () => {
  const r = compareRuns(run({ p95: 100 }), run({ p95: 50 }));
  assert.equal(r.rows.find((x) => x.key === "p95").verdict, "improved");
});

test("throughput drop is a regression, gain is an improvement", () => {
  const drop = compareRuns(run({ rps: 100 }), run({ rps: 50 }));
  assert.deepEqual(drop.regressedMetrics, ["rps"]);
  const gain = compareRuns(run({ rps: 100 }), run({ rps: 200 }));
  assert.equal(gain.rows.find((x) => x.key === "rps").verdict, "improved");
});

test("error-rate rise (including from zero) is a regression", () => {
  const rise = compareRuns(run({ errorRate: 0.01 }), run({ errorRate: 0.1 }));
  assert.ok(rise.regressedMetrics.includes("errorRate"));
  const fromZero = compareRuns(run({ errorRate: 0 }), run({ errorRate: 0.05 }));
  assert.deepEqual(fromZero.regressedMetrics, ["errorRate"]);
  assert.equal(fromZero.rows.find((x) => x.key === "errorRate").deltaPct, null);
});

test("runs without latency data are skipped, not failed", () => {
  const empty = { meta: { url: "http://x" }, summary: { count: 0, errorRate: 0,
    latency: null, throughput: { wallMs: 100, rps: 0, bytesTotal: 0, mibPerSec: 0 } } };
  const r = compareRuns(empty, run());
  const p50 = r.rows.find((x) => x.key === "p50");
  assert.equal(p50.verdict, "ok");
  assert.equal(p50.deltaPct, null);
});

test("direction handling: lower latency is better for every latency metric", () => {
  const better = compareRuns(run({ p50: 100, p95: 200, p99: 300 }),
    run({ p50: 90, p95: 180, p99: 270 }));
  for (const key of ["p50", "p95", "p99"]) {
    assert.equal(better.rows.find((x) => x.key === key).verdict, "improved", key);
  }
  assert.equal(better.passed, true);
});