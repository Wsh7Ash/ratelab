// Open-model load runner: dispatches requests along a timed schedule
// (does not wait for a response before scheduling the next one) and
// records one sample per attempt.

import { rpsAt } from "./profile.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export { rpsAt };

/**
 * Run a load schedule against `url`.
 *
 * Options:
 *   url            target URL (required)
 *   segments       schedule from buildProfile()
 *   concurrency    max in-flight requests (excess is counted as throttled)
 *   requestTimeoutMs  per-request AbortSignal timeout
 *   fetchFn        injectable fetch (tests)
 *   maxBurst       max catch-up dispatches per scheduler tick (default 50)
 *   settleMs       how long to wait for stragglers after the schedule ends
 *
 * Returns { samples, meta }.
 */
export async function runLoad({
  url,
  segments,
  concurrency = 64,
  requestTimeoutMs = 10_000,
  fetchFn = globalThis.fetch,
  maxBurst = 50,
  settleMs = 30_000,
} = {}) {
  if (!url) throw new Error("runLoad: url is required");
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error("runLoad: empty schedule");
  }
  const endMs = segments[segments.length - 1].until;
  if (typeof fetchFn !== "function") throw new Error("runLoad: no fetch implementation");

  const samples = [];
  const inflight = new Set();
  let maxInflight = 0;
  let throttled = 0;

  async function dispatch() {
    const sample = {
      start: Date.now(), ms: null, status: null, err: null, bytes: 0, failed: false,
    };
    const promise = (async () => {
      try {
        const res = await fetchFn(url, {
          signal: AbortSignal.timeout(requestTimeoutMs),
          redirect: "follow",
        });
        const body = await res.arrayBuffer();
        sample.status = res.status;
        sample.bytes = body.byteLength;
      } catch (e) {
        const name = e?.name ?? "";
        sample.err =
          name === "TimeoutError" || name === "AbortError"
            ? "timeout"
            : String(e?.cause?.code ?? e?.message ?? e);
      } finally {
        sample.ms = Date.now() - sample.start;
        sample.failed =
          sample.err !== null ||
          sample.status === null ||
          sample.status >= 400;
        samples.push(sample);
        inflight.delete(promise);
      }
    })();
    inflight.add(promise);
    if (inflight.size > maxInflight) maxInflight = inflight.size;
  }

  const start = Date.now();
  let next = start;

  for (;;) {
    const now = Date.now();
    const elapsed = now - start;
    if (elapsed >= endMs) break;
    if (now >= next) {
      const rps = rpsAt(segments, elapsed);
      if (rps <= 0) {
        next = now + 20;
        continue;
      }
      const interval = 1000 / rps;
      let burst = 0;
      while (next <= now && burst < maxBurst) {
        if (inflight.size < concurrency) void dispatch();
        else throttled += 1;
        next += interval;
        burst += 1;
      }
      if (next <= now) next = now + interval; // backlog beyond burst: resync
    } else {
      await sleep(Math.min(next - now, 25));
    }
  }

  // Let outstanding requests finish so their latency is counted.
  const settleDeadline = Date.now() + settleMs;
  while (inflight.size > 0 && Date.now() < settleDeadline) await sleep(10);
  if (inflight.size > 0) {
    await Promise.race([...inflight]);
  }

  const wallMs = Date.now() - start;
  return {
    samples,
    meta: {
      url,
      wallMs,
      endMs,
      concurrency,
      maxInflight,
      throttled,
      requestTimeoutMs,
    },
  };
}