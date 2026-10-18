import test from "node:test";
import assert from "node:assert/strict";
import { runLoad } from "../src/runner.js";
import { buildProfile } from "../src/profile.js";
import { summarize } from "../src/stats.js";
import { createDemoServer } from "../src/server.js";

let demo;
let base;

test.before(async () => {
  demo = createDemoServer();
  const port = await demo.listen(0);
  base = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  await demo.close();
});

const cons = (rps, duration) =>
  buildProfile({ type: "constant", rps, duration });

test("constant run against /ok produces samples with no errors", async () => {
  const { samples, meta } = await runLoad({
    url: `${base}/ok`,
    segments: cons(40, "800ms").segments,
    concurrency: 32,
  });
  const s = summarize(samples, meta.wallMs);
  assert.ok(s.count >= 5, `expected several samples, got ${s.count}`);
  assert.equal(s.failed, 0);
  assert.equal(s.errorRate, 0);
  assert.equal(s.statusCounts["200"], s.count);
  assert.ok(s.throughput.rps > 5 && s.throughput.rps < 400,
    `implausible achieved rps: ${s.throughput.rps}`);
  assert.ok(meta.wallMs >= meta.endMs, "run waits at least the schedule length");
  assert.ok(meta.maxInflight <= 32);
});

test("run against /error records every request as failed", async () => {
  const { samples, meta } = await runLoad({
    url: `${base}/error`,
    segments: cons(30, "600ms").segments,
  });
  const s = summarize(samples, meta.wallMs);
  assert.ok(s.count >= 3);
  assert.equal(s.failed, s.count);
  assert.equal(s.errorRate, 1);
  assert.equal(s.statusCounts["500"], s.count);
});

test("run against /flaky mixes 200s and 500s", async () => {
  const { samples, meta } = await runLoad({
    url: `${base}/flaky`,
    segments: cons(25, "1s").segments,
  });
  const s = summarize(samples, meta.wallMs);
  assert.ok(s.count >= 8, `got ${s.count}`);
  assert.ok((s.statusCounts["200"] ?? 0) > 0, "expected some 200s");
  assert.ok((s.statusCounts["500"] ?? 0) > 0, "expected some 500s");
  assert.ok(s.errorRate > 0 && s.errorRate < 1);
});

test("concurrency cap holds on a slow endpoint", async () => {
  const { meta } = await runLoad({
    url: `${base}/slow?ms=250`,
    segments: cons(100, "700ms").segments,
    concurrency: 2,
  });
  assert.ok(meta.maxInflight <= 2, `maxInflight ${meta.maxInflight} exceeded cap`);
  assert.ok(meta.throttled > 0, "expected some dispatches to be throttled");
});

test("per-request timeout marks samples as timeout failures", async () => {
  const { samples, meta } = await runLoad({
    url: `${base}/slow?ms=400`,
    segments: cons(10, "400ms").segments,
    concurrency: 4,
    requestTimeoutMs: 50,
  });
  const s = summarize(samples, meta.wallMs);
  assert.ok(s.count >= 1);
  assert.equal(s.failed, s.count);
  assert.ok(s.timeouts >= 1, "expected at least one timeout");
  assert.ok(samples.every((x) => x.err === "timeout"));
});

test("404 responses count as failed", async () => {
  const { samples, meta } = await runLoad({
    url: `${base}/missing`,
    segments: cons(20, "400ms").segments,
  });
  const s = summarize(samples, meta.wallMs);
  assert.ok(s.count >= 1);
  assert.equal(s.failed, s.count);
  assert.equal(s.statusCounts["404"], s.count);
});

test("step profile schedules rate changes over time", async () => {
  const profile = buildProfile({ type: "step", rps: 10, rpsMax: 60, steps: 2, duration: "800ms" });
  const start = Date.now();
  const { meta } = await runLoad({ url: `${base}/ok`, segments: profile.segments });
  assert.ok(Date.now() - start >= 750, "run lasts about the full schedule");
  assert.equal(meta.endMs, 800);
});

test("runner validates its inputs", async () => {
  await assert.rejects(() => runLoad({ segments: cons(1, "1s").segments }), /url/);
  await assert.rejects(() => runLoad({ url: `${base}/ok`, segments: [] }), /schedule/);
  await assert.rejects(
    () => runLoad({ url: `${base}/ok`, segments: cons(1, "1s").segments, fetchFn: null }),
    /fetch/);
});