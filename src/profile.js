// Load profiles: turn CLI options into a piecewise-constant schedule
// [{ until, rps }, ...] measured in milliseconds from t=0.

const DURATION_RE = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/;
const UNIT_MS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };

/** Parse "500ms" | "10s" | "2m" | "1h" (or a number of ms) into ms.
 *  Zero is rejected unless `allowZero` (offsets like `--spike-at 0s`). */
export function parseDuration(input, { allowZero = false } = {}) {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0 || (!allowZero && input === 0)) {
      throw new Error(`invalid duration: ${input}`);
    }
    return input;
  }
  const m = DURATION_RE.exec(String(input).trim());
  if (!m) throw new Error(`invalid duration: ${input}`);
  const value = parseFloat(m[1]);
  const ms = value * UNIT_MS[m[2] ?? "s"];
  if (!Number.isFinite(ms) || ms < 0 || (!allowZero && ms === 0)) {
    throw new Error(`duration must be ${allowZero ? "non-negative" : "positive"}: ${input}`);
  }
  return ms;
}

const posNum = (name, value) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`invalid ${name}: ${value}`);
  }
  return value;
};

/**
 * Build the schedule for a profile.
 *   constant: flat `rps` for `duration`
 *   step:     equal-length steps ramping linearly rps -> rpsMax over `steps`
 *   spike:    baseline rps, jumping to spikeRps for spikeFor starting at spikeAt
 */
export function buildProfile({
  type = "constant",
  rps = 10,
  duration,
  rpsMax,
  steps = 5,
  spikeRps,
  spikeAt = "0s",
  spikeFor,
} = {}) {
  rps = posNum("rps", rps);
  const durationMs = parseDuration(duration ?? "10s");

  if (type === "constant") {
    return {
      type,
      durationMs,
      segments: [{ until: durationMs, rps }],
    };
  }

  if (type === "step") {
    if (rpsMax === undefined) throw new Error("step profile requires --rps-max");
    rpsMax = posNum("rps-max", rpsMax);
    steps = Number(steps);
    if (!Number.isInteger(steps) || steps < 2) {
      throw new Error(`steps must be an integer >= 2: ${steps}`);
    }
    const segMs = durationMs / steps;
    const segments = [];
    for (let i = 0; i < steps; i++) {
      const level = rps + ((rpsMax - rps) * i) / (steps - 1);
      segments.push({ until: segMs * (i + 1), rps: level });
    }
    return { type, durationMs, segments };
  }

  if (type === "spike") {
    if (spikeRps === undefined) throw new Error("spike profile requires --spike-rps");
    spikeRps = posNum("spike-rps", spikeRps);
    const at = parseDuration(spikeAt, { allowZero: true });
    const forMs = parseDuration(spikeFor ?? "2s", { allowZero: true });
    if (at >= durationMs) {
      throw new Error(`--spike-at (${at}ms) must be before the end of the run`);
    }
    const end = Math.min(at + forMs, durationMs);
    const segments = [];
    if (at > 0) segments.push({ until: at, rps });
    if (end > at) segments.push({ until: end, rps: spikeRps });
    if (end < durationMs) segments.push({ until: durationMs, rps });
    if (segments.length === 0 || segments[segments.length - 1].until !== durationMs) {
      segments.push({ until: durationMs, rps });
    }
    return { type, durationMs, segments };
  }

  throw new Error(`unknown profile: ${type} (use constant | step | spike)`);
}

/** Target request rate at a given elapsed time of the schedule. */
export function rpsAt(segments, elapsedMs) {
  for (const seg of segments) {
    if (elapsedMs < seg.until) return seg.rps;
  }
  return 0;
}