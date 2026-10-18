import test from "node:test";
import assert from "node:assert/strict";
import { parseDuration, buildProfile, rpsAt } from "../src/profile.js";

test("parseDuration handles all units", () => {
  assert.equal(parseDuration("500ms"), 500);
  assert.equal(parseDuration("10s"), 10_000);
  assert.equal(parseDuration("2m"), 120_000);
  assert.equal(parseDuration("1h"), 3_600_000);
});

test("parseDuration defaults bare numbers to seconds", () => {
  assert.equal(parseDuration("10"), 10_000);
});

test("parseDuration passes numeric ms through", () => {
  assert.equal(parseDuration(250), 250);
});

test("parseDuration rejects garbage and non-positive values", () => {
  assert.throws(() => parseDuration("abc"));
  assert.throws(() => parseDuration("10x"));
  assert.throws(() => parseDuration("0s"));
  assert.throws(() => parseDuration(-5));
  assert.throws(() => parseDuration(-1));
});

test("constant profile is one flat segment", () => {
  const p = buildProfile({ type: "constant", rps: 50, duration: "3s" });
  assert.equal(p.type, "constant");
  assert.equal(p.durationMs, 3000);
  assert.deepEqual(p.segments, [{ until: 3000, rps: 50 }]);
});

test("step profile ramps linearly across equal segments", () => {
  const p = buildProfile({ type: "step", rps: 10, rpsMax: 100, steps: 4, duration: "8s" });
  assert.equal(p.segments.length, 4);
  assert.equal(p.segments[3].until, 8000);
  assert.equal(p.segments[0].rps, 10);
  assert.equal(p.segments[3].rps, 100);
  assert.ok(p.segments[1].rps > p.segments[0].rps);
  assert.deepEqual(p.segments.map((s) => s.until), [2000, 4000, 6000, 8000]);
});

test("step profile requires rps-max and at least 2 steps", () => {
  assert.throws(() => buildProfile({ type: "step", rps: 1, duration: "5s" }), /rps-max/);
  assert.throws(
    () => buildProfile({ type: "step", rps: 1, rpsMax: 5, steps: 1, duration: "5s" }),
    /steps/);
  assert.throws(
    () => buildProfile({ type: "step", rps: 1, rpsMax: 5, steps: 2.5, duration: "5s" }),
    /steps/);
});

test("spike profile has baseline, spike, baseline segments", () => {
  const p = buildProfile({
    type: "spike", rps: 20, spikeRps: 500, spikeAt: "2s", spikeFor: "1s", duration: "6s",
  });
  assert.deepEqual(p.segments, [
    { until: 2000, rps: 20 },
    { until: 3000, rps: 500 },
    { until: 6000, rps: 20 },
  ]);
});

test("spike profile starting at zero omits the leading baseline", () => {
  const p = buildProfile({
    type: "spike", rps: 5, spikeRps: 50, spikeAt: "0s", spikeFor: "1s", duration: "3s",
  });
  assert.deepEqual(p.segments, [
    { until: 1000, rps: 50 },
    { until: 3000, rps: 5 },
  ]);
});

test("spike profile validates its inputs", () => {
  assert.throws(() => buildProfile({ type: "spike", rps: 1, duration: "5s" }), /spike-rps/);
  assert.throws(
    () => buildProfile({ type: "spike", rps: 1, spikeRps: 9, spikeAt: "9s", duration: "5s" }),
    /spike-at/);
  assert.throws(() => buildProfile({ type: "wat", duration: "5s" }), /unknown profile/);
  assert.throws(() => buildProfile({ type: "constant", rps: -1, duration: "5s" }), /rps/);
});

test("rpsAt resolves boundaries of the schedule", () => {
  const segs = [
    { until: 1000, rps: 10 },
    { until: 2000, rps: 20 },
    { until: 3000, rps: 30 },
  ];
  assert.equal(rpsAt(segs, 0), 10);
  assert.equal(rpsAt(segs, 999), 10);
  assert.equal(rpsAt(segs, 1000), 20);
  assert.equal(rpsAt(segs, 2500), 30);
  assert.equal(rpsAt(segs, 3000), 0);
  assert.equal(rpsAt(segs, 99_999), 0);
});