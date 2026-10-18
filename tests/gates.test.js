import test from "node:test";
import assert from "node:assert/strict";
import { evaluateGates } from "../src/gates.js";

const summary = (over = {}) => ({
  count: 100,
  failed: 5,
  errorRate: 0.05,
  latency: { min: 1, max: 90, mean: 20, stddev: 10, p50: 15, p90: 60, p95: 75, p99: 85 },
  throughput: { wallMs: 2000, rps: 50, bytesTotal: 1000, mibPerSec: 0.5 },
  statusCounts: { 200: 95, 500: 5 },
  timeouts: 0,
  ...over,
});

test("no gates configured always passes with zero checks", () => {
  const r = evaluateGates(summary());
  assert.equal(r.passed, true);
  assert.equal(r.checks.length, 0);
});

test("latency gate passes when under the limit", () => {
  const r = evaluateGates(summary(), { p99Max: 100 });
  assert.equal(r.passed, true);
  assert.deepEqual(r.checks[0], {
    name: "p99Max", unit: "ms", limit: 100, actual: 85, ok: true,
  });
});

test("latency gate fails when over the limit", () => {
  const r = evaluateGates(summary(), { p95Max: 50 });
  assert.equal(r.passed, false);
  assert.equal(r.checks[0].ok, false);
});

test("latency gate fails when there are no samples", () => {
  const r = evaluateGates(summary({ latency: null }), { p50Max: 100 });
  assert.equal(r.passed, false);
  assert.ok(Number.isNaN(r.checks[0].actual) || r.checks[0].actual === null);
});

test("error-rate gate uses percent and boundary is inclusive", () => {
  const pass = evaluateGates(summary({ errorRate: 0.05 }), { errorRateMax: 5 });
  assert.equal(pass.passed, true, "exactly at the limit passes");
  const fail = evaluateGates(summary({ errorRate: 0.051 }), { errorRateMax: 5 });
  assert.equal(fail.passed, false);
  assert.equal(fail.checks[0].unit, "%");
  assert.ok(Math.abs(fail.checks[0].actual - 5.1) < 1e-9);
});

test("rps-min gate fails on slow throughput", () => {
  const slow = summary({ throughput: { wallMs: 2000, rps: 9, bytesTotal: 0, mibPerSec: 0 } });
  const r = evaluateGates(slow, { rpsMin: 10 });
  assert.equal(r.passed, false);
  assert.equal(r.checks[0].actual, 9);
});

test("min-requests gate ensures enough samples", () => {
  const tiny = summary({ count: 3 });
  assert.equal(evaluateGates(tiny, { minRequests: 3 }).passed, true);
  assert.equal(evaluateGates(tiny, { minRequests: 4 }).passed, false);
});

test("any single failure fails the whole gate set", () => {
  const r = evaluateGates(summary(), { p50Max: 10, errorRateMax: 0, rpsMin: 1 });
  assert.equal(r.checks.length, 3);
  assert.equal(r.passed, false);
  assert.deepEqual(r.checks.map((c) => c.ok), [false, false, true]);
});