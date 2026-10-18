// Text renderers for run reports and comparisons (JSON is written by the CLI).

const fmt = (v, digits = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? "-" : Number(v).toFixed(digits);

const pad = (s, w) => String(s).padEnd(w);

/**
 * Human-readable report for one run.
 * run = { meta, summary, gates, profile }
 */
export function formatRun(run) {
  const { meta, summary, gates, profile } = run;
  const lat = summary.latency;
  const lines = [];

  lines.push("ratelab report");
  lines.push(`  target      ${meta.url}`);
  if (profile) {
    lines.push(
      `  profile     ${profile.type} (${profile.segments
        .map((s) => `${s.rps} req/s`)
        .join(" -> ")}) for ${fmt(profile.durationMs / 1000, 1)}s, concurrency ${
        meta.concurrency ?? "-"
      }`);
  }
  lines.push(
    `  requests    ${summary.count} total, ${summary.failed} failed (` +
      `${fmt(summary.errorRate * 100, 2)}%), ${summary.timeouts} timeout(s)`);
  lines.push(
    `  wall        ${fmt(summary.throughput.wallMs / 1000, 2)}s   achieved ` +
      `${fmt(summary.throughput.rps, 1)} req/s   ` +
      `${fmt(summary.throughput.mibPerSec, 3)} MiB/s`);
  if (meta.maxInflight !== undefined) {
    lines.push(
      `  scheduling  max in-flight ${meta.maxInflight}/${meta.concurrency}` +
        (meta.throttled ? `, ${meta.throttled} dispatch(es) throttled` : ""));
  }

  lines.push("");
  lines.push("  latency (ms)");
  if (!lat) {
    lines.push("    no completed samples");
  } else {
    lines.push(
      `    min ${fmt(lat.min)}   p50 ${fmt(lat.p50)}   p90 ${fmt(lat.p90)}   ` +
        `p95 ${fmt(lat.p95)}   p99 ${fmt(lat.p99)}   max ${fmt(lat.max)}   ` +
        `mean ${fmt(lat.mean)}   sd ${fmt(lat.stddev)}`);
  }

  const statuses = Object.entries(summary.statusCounts).sort((a, b) => b[1] - a[1]);
  if (statuses.length) {
    lines.push("");
    lines.push("  statuses");
    lines.push("    " + statuses.map(([k, v]) => `${k}: ${v}`).join("   "));
  }

  if (gates && gates.checks.length) {
    lines.push("");
    lines.push("  gates");
    for (const c of gates.checks) {
      lines.push(
        `    ${c.ok ? "PASS" : "FAIL"}  ${c.name} <= ${c.limit} ${c.unit} ` +
          `(actual ${fmt(c.actual, 2)})`);
    }
  }

  return lines.join("\n");
}

/** Table comparing two runs. cmp from compareRuns(). */
export function formatCompare(a, b, cmp) {
  const nameOf = (r) => r?.meta?.url || r?.meta?.label || "run";
  const lines = [];
  lines.push("ratelab compare");
  lines.push(`  baseline    ${nameOf(a)}`);
  lines.push(`  candidate   ${nameOf(b)}`);
  lines.push(`  threshold   +/- ${cmp.maxRegressPct}% counts as a regression`);
  lines.push("");
  lines.push(
    `    ${pad("metric", 22)}${pad("baseline", 12)}${pad("candidate", 12)}${pad("delta", 10)}verdict`);
  for (const row of cmp.rows) {
    const delta = row.deltaPct === null ? "-" : `${row.deltaPct >= 0 ? "+" : ""}${fmt(row.deltaPct, 1)}%`;
    lines.push(
      `    ${pad(row.label, 22)}${pad(fmt(row.baseline, 2), 12)}` +
        `${pad(fmt(row.candidate, 2), 12)}${pad(delta, 10)}${row.verdict}`);
  }
  lines.push("");
  lines.push(
    cmp.passed
      ? `  OK: no regression beyond ${cmp.maxRegressPct}%`
      : `  FAIL: regressed metrics: ${cmp.regressedMetrics.join(", ")}`);
  return lines.join("\n");
}