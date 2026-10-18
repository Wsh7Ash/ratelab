// Compare two saved ratelab runs (baseline vs candidate) and flag
// regressions beyond a percentage threshold.

export const COMPARE_METRICS = [
  { key: "p50", label: "p50 (ms)", higherIsBetter: false, get: (r) => r?.summary?.latency?.p50 },
  { key: "p95", label: "p95 (ms)", higherIsBetter: false, get: (r) => r?.summary?.latency?.p95 },
  { key: "p99", label: "p99 (ms)", higherIsBetter: false, get: (r) => r?.summary?.latency?.p99 },
  { key: "rps", label: "throughput (req/s)", higherIsBetter: true, get: (r) => r?.summary?.throughput?.rps },
  { key: "errorRate", label: "error rate (%)", higherIsBetter: false, get: (r) => (r?.summary?.errorRate ?? 0) * 100 },
];

/**
 * Compare run A (baseline) with run B (candidate).
 * A metric "regresses" when it moves the wrong way by more than
 * maxRegressPct percent. Zero-baseline denominators: any worsening from
 * 0 counts as a full (100%) regression, any improvement from 0 is capped
 * at +100% for reporting.
 */
export function compareRuns(a, b, { maxRegressPct = 10 } = {}) {
  const rows = [];
  for (const m of COMPARE_METRICS) {
    const va = m.get(a);
    const vb = m.get(b);
    if (!Number.isFinite(va) || !Number.isFinite(vb)) {
      rows.push({ key: m.key, label: m.label, baseline: va ?? null, candidate: vb ?? null,
        deltaPct: null, verdict: "ok" });
      continue;
    }
    let deltaPct;
    let usefulPct;
    if (va === 0) {
      // No denominator: any worsening from 0 is a full regression,
      // any improvement from 0 is a full gain; % change itself is undefined.
      deltaPct = vb === 0 ? 0 : null;
      usefulPct = vb === 0 ? 0 : m.higherIsBetter ? 100 : -100;
    } else {
      deltaPct = ((vb - va) / Math.abs(va)) * 100;
      usefulPct = m.higherIsBetter ? deltaPct : -deltaPct;
    }
    const verdict =
      usefulPct <= -maxRegressPct ? "regressed"
      : usefulPct >= maxRegressPct ? "improved"
      : "ok";
    rows.push({
      key: m.key, label: m.label,
      baseline: va, candidate: vb,
      deltaPct, verdict,
    });
  }
  const regressions = rows.filter((r) => r.verdict === "regressed");
  return {
    maxRegressPct,
    rows,
    regressions: regressions.length,
    regressedMetrics: regressions.map((r) => r.key),
    passed: regressions.length === 0,
  };
}