// SLO gate checks: compare a run summary against thresholds.
// Gate names double as CLI flags: --p99-max 300 => { p99Max: 300 }.

const LATENCY_GATES = [
  ["p50Max", "p50"],
  ["p95Max", "p95"],
  ["p99Max", "p99"],
];

/**
 * Evaluate gates against a summary.
 * Returns { passed, checks } where each check is
 * { name, unit, limit, actual, ok }.
 * No gates configured => passed: true with zero checks.
 */
export function evaluateGates(summary, gates = {}) {
  const checks = [];
  const lat = summary.latency;
  const push = (name, unit, limit, actual, ok) =>
    checks.push({ name, unit, limit, actual, ok: Boolean(ok) });

  for (const [gate, key] of LATENCY_GATES) {
    if (gates[gate] === undefined || gates[gate] === null) continue;
    const limit = Number(gates[gate]);
    const actual = lat ? lat[key] : Number.NaN;
    push(gate, "ms", limit, actual, Number.isFinite(actual) && actual <= limit);
  }

  if (gates.errorRateMax !== undefined && gates.errorRateMax !== null) {
    const limit = Number(gates.errorRateMax);
    const actual = summary.errorRate * 100;
    push(gates.errorRateMax === undefined ? "errorRateMax" : "errorRateMax",
      "%", limit, actual, actual <= limit);
  }

  if (gates.rpsMin !== undefined && gates.rpsMin !== null) {
    const limit = Number(gates.rpsMin);
    const actual = summary.throughput.rps;
    push("rpsMin", "req/s", limit, actual, actual >= limit);
  }

  if (gates.minRequests !== undefined && gates.minRequests !== null) {
    const limit = Number(gates.minRequests);
    push("minRequests", "count", limit, summary.count, summary.count >= limit);
  }

  return { passed: checks.every((c) => c.ok), checks };
}