// Latency/throughput statistics. Pure functions over recorded samples.
// A sample is { start, ms, status, err, bytes, failed, }.

/** Linear-interpolated percentile (R-7 / Excel PERCENTILE convention). */
export function percentile(sortedAsc, p) {
  if (!Number.isFinite(p) || p < 0 || p > 100) {
    throw new RangeError(`percentile out of range: ${p}`);
  }
  const n = sortedAsc.length;
  if (n === 0) return Number.NaN;
  if (n === 1) return sortedAsc[0];
  const rank = (p / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (rank - lo);
}

export function mean(xs) {
  if (xs.length === 0) return Number.NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (n-1); NaN for 0 samples, 0 for 1. */
export function stddev(xs) {
  if (xs.length === 0) return Number.NaN;
  if (xs.length === 1) return 0;
  const m = mean(xs);
  const variance = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/**
 * Summarize samples plus the wall-clock duration of the run.
 * Latencies include every completed request (fast failures included);
 * failed requests are counted separately via `failed`/`errorRate`.
 */
export function summarize(samples, wallMs) {
  const count = samples.length;
  const latencies = samples
    .filter((s) => s.ms !== null && s.ms !== undefined)
    .map((s) => s.ms)
    .sort((a, b) => a - b);

  let failed = 0;
  let timeouts = 0;
  let bytes = 0;
  const statusCounts = {};
  for (const s of samples) {
    if (s.failed) failed += 1;
    if (s.err === "timeout") timeouts += 1;
    bytes += s.bytes || 0;
    const key =
      s.status === null || s.status === undefined
        ? s.err === "timeout" ? "timeout" : "error"
        : String(s.status);
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
  }

  const seconds = wallMs > 0 ? wallMs / 1000 : 0;
  const latency =
    latencies.length === 0
      ? null
      : {
          min: latencies[0],
          max: latencies[latencies.length - 1],
          mean: mean(latencies),
          stddev: stddev(latencies),
          p50: percentile(latencies, 50),
          p90: percentile(latencies, 90),
          p95: percentile(latencies, 95),
          p99: percentile(latencies, 99),
        };

  return {
    count,
    failed,
    timeouts,
    errorRate: count > 0 ? failed / count : 0,
    statusCounts,
    latency,
    throughput: {
      wallMs,
      rps: seconds > 0 ? count / seconds : 0,
      bytesTotal: bytes,
      mibPerSec: seconds > 0 ? bytes / 1048576 / seconds : 0,
    },
  };
}