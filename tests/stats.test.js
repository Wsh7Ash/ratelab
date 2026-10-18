import test from "node:test";
import assert from "node:assert/strict";
import { percentile, mean, stddev, summarize } from "../src/stats.js";

test("percentile returns NaN for empty input", () => {
  assert.ok(Number.isNaN(percentile([], 50)));
});

test("percentile of one sample is that sample", () => {
  assert.equal(percentile([7], 99), 7);
  assert.equal(percentile([7], 0), 7);
});

test("percentile interpolates linearly (R-7)", () => {
  const xs = [1, 2, 3, 4];
  assert.equal(percentile(xs, 0), 1);
  assert.equal(percentile(xs, 50), 2.5);
  assert.equal(percentile(xs, 100), 4);
  assert.equal(percentile([10, 20, 30], 90), 28);
});

test("percentile rejects out-of-range p", () => {
  assert.throws(() => percentile([1], -1), RangeError);
  assert.throws(() => percentile([1], 101), RangeError);
  assert.throws(() => percentile([1], Number.NaN), RangeError);
});

test("mean of known values", () => {
  assert.equal(mean([2, 4, 6]), 4);
  assert.ok(Number.isNaN(mean([])));
});

test("stddev is sample (n-1) deviation", () => {
  assert.equal(stddev([5]), 0);
  assert.ok(Number.isNaN(stddev([])));
  assert.ok(Math.abs(stddev([2, 4]) - Math.SQRT2) < 1e-12);
});

const sample = (over = {}) => ({
  start: 0, ms: 1, status: 200, err: null, bytes: 10, failed: false, ...over,
});

test("summarize computes latency percentiles and throughput", () => {
  const samples = [sample({ ms: 10 }), sample({ ms: 20 }), sample({ ms: 30 })];
  const s = summarize(samples, 1000);
  assert.equal(s.count, 3);
  assert.equal(s.failed, 0);
  assert.equal(s.errorRate, 0);
  assert.equal(s.latency.p50, 20);
  assert.equal(s.latency.min, 10);
  assert.equal(s.latency.max, 30);
  assert.equal(s.throughput.rps, 3);
  assert.equal(s.throughput.bytesTotal, 30);
  assert.deepEqual(s.statusCounts, { 200: 3 });
});

test("summarize classifies failures, timeouts and non-200 statuses", () => {
  const samples = [
    sample(),
    sample({ status: 500, failed: true }),
    sample({ status: null, err: "ECONNRESET", failed: true }),
    sample({ status: 404, failed: true }),
    sample({ ms: 5, status: null, err: "timeout", failed: true }),
  ];
  const s = summarize(samples, 5000);
  assert.equal(s.count, 5);
  assert.equal(s.failed, 4);
  assert.equal(s.errorRate, 4 / 5);
  assert.equal(s.timeouts, 1);
  assert.equal(s.statusCounts["500"], 1);
  assert.equal(s.statusCounts["error"], 1);
  assert.equal(s.statusCounts["404"], 1);
});

test("summarize of no samples yields null latency and zero rates", () => {
  const s = summarize([], 3000);
  assert.equal(s.count, 0);
  assert.equal(s.latency, null);
  assert.equal(s.errorRate, 0);
  assert.equal(s.throughput.rps, 0);
});

test("summarize handles zero wall time without dividing by zero", () => {
  const s = summarize([sample()], 0);
  assert.equal(s.throughput.rps, 0);
});