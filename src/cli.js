#!/usr/bin/env node
// ratelab CLI: run | serve | compare

import { readFileSync, writeFileSync } from "node:fs";
import { buildProfile, parseDuration } from "./profile.js";
import { runLoad } from "./runner.js";
import { summarize } from "./stats.js";
import { evaluateGates } from "./gates.js";
import { compareRuns } from "./compare.js";
import { formatRun, formatCompare } from "./report.js";
import { createDemoServer } from "./server.js";

const VERSION = "1.0.0";

const USAGE = `ratelab ${VERSION} — offline-first HTTP load testing with SLO gates

Usage:
  ratelab run --url <URL> [options]
  ratelab serve [--port <N>]
  ratelab compare <baseline.json> <candidate.json> [--max-regress <PCT>]

Run options:
  --url <URL>            target URL (required)
  --profile <P>          constant | step | spike   (default: constant)
  --duration <D>         e.g. 500ms, 10s, 2m       (default: 10s)
  --rps <N>              request rate / baseline   (default: 10)
  --rps-max <N>          step: top of the ramp
  --steps <N>            step: number of steps     (default: 5)
  --spike-rps <N>        spike: rate during the spike
  --spike-at <D>         spike: start offset        (default: 0s)
  --spike-for <D>        spike: spike length        (default: 2s)
  --concurrency <N>      max in-flight requests    (default: 64)
  --timeout <D>          per-request timeout       (default: 10s)
  --json <FILE>          write the full run as JSON
  --p50-max <MS> --p95-max <MS> --p99-max <MS>   latency gates
  --error-rate-max <PCT> error-rate gate (percent)
  --rps-min <N>          throughput gate
  --min-requests <N>     sample-count gate

Exit codes:
  0 gates passed   1 a gate failed (or compare regressed)   2 usage error

Compare flags:
  --max-regress <PCT>  regression threshold (default: 10)
`;

const BOOL_FLAGS = new Set(["help", "h", "version", "V"]);
const GATE_FLAGS = new Map([
  ["--p50-max", "p50Max"],
  ["--p95-max", "p95Max"],
  ["--p99-max", "p99Max"],
  ["--error-rate-max", "errorRateMax"],
  ["--rps-min", "rpsMin"],
  ["--min-requests", "minRequests"],
]);

function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    let key = eq === -1 ? arg : arg.slice(0, eq);
    let value = eq === -1 ? undefined : arg.slice(eq + 1);
    const bare = key.slice(2);
    if (BOOL_FLAGS.has(bare)) {
      flags[bare] = true;
      continue;
    }
    if (value === undefined) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new Error(`missing value for ${key}`);
      }
      value = next;
      i += 1;
    }
    flags[bare] = value;
  }
  return { positionals, flags };
}

const num = (flags, name) =>
  flags[name] === undefined ? undefined : Number(flags[name]);

function usageError(msg) {
  process.stderr.write(`ratelab: ${msg}\n\n${USAGE}`);
  process.exit(2);
}

async function cmdRun(flags) {
  if (!flags.url) throw new Error("--url is required");

  let profile;
  try {
    profile = buildProfile({
      type: flags.profile ?? "constant",
      rps: num(flags, "rps") ?? 10,
      duration: flags.duration ?? "10s",
      rpsMax: num(flags, "rps-max"),
      steps: num(flags, "steps") ?? 5,
      spikeRps: num(flags, "spike-rps"),
      spikeAt: flags["spike-at"] ?? "0s",
      spikeFor: flags["spike-for"],
    });
  } catch (e) {
    throw new Error(e.message);
  }

  const concurrency = num(flags, "concurrency") ?? 64;
  if (!Number.isFinite(concurrency) || concurrency < 1) {
    throw new Error("--concurrency must be a positive integer");
  }
  const requestTimeoutMs = parseDuration(flags.timeout ?? "10s");

  const gates = {};
  for (const [flag, name] of GATE_FLAGS) {
    if (flags[flag.slice(2)] !== undefined) {
      const v = Number(flags[flag.slice(2)]);
      if (!Number.isFinite(v)) throw new Error(`${flag} must be a number`);
      gates[name] = v;
    }
  }

  const { samples, meta } = await runLoad({
    url: flags.url,
    segments: profile.segments,
    concurrency,
    requestTimeoutMs,
  });

  const summary = summarize(samples, meta.wallMs);
  const gateResult = evaluateGates(summary, gates);
  const run = {
    tool: "ratelab",
    version: VERSION,
    startedAt: new Date().toISOString(),
    profile,
    meta,
    summary,
    gates: gateResult,
  };

  if (flags.json) {
    writeFileSync(flags.json, JSON.stringify(run, null, 2) + "\n");
  }
  process.stdout.write(formatRun(run) + "\n");
  return gateResult.passed ? 0 : 1;
}

async function cmdServe(flags) {
  const port = num(flags, "port") ?? 8080;
  const demo = createDemoServer();
  const actual = await demo.listen(port);
  process.stdout.write(
    `ratelab demo target listening on http://127.0.0.1:${actual}\n` +
      `  routes: /ok /slow?ms= /error /flaky /bytes?size=\n` +
      `  try: ratelab run --url http://127.0.0.1:${actual}/ok --rps 50 --duration 5s\n`);
  const shutdown = async () => {
    await demo.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function loadRun(path) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!parsed || typeof parsed !== "object" || !parsed.summary) {
    throw new Error(`${path}: not a ratelab run file (missing "summary")`);
  }
  return parsed;
}

function cmdCompare(positionals, flags) {
  if (positionals.length !== 2) {
    throw new Error("compare needs <baseline.json> <candidate.json>");
  }
  const a = loadRun(positionals[0]);
  const b = loadRun(positionals[1]);
  const maxRegressPct =
    flags["max-regress"] === undefined ? 10 : Number(flags["max-regress"]);
  if (!Number.isFinite(maxRegressPct) || maxRegressPct < 0) {
    throw new Error("--max-regress must be a non-negative number");
  }
  const cmp = compareRuns(a, b, { maxRegressPct });
  process.stdout.write(formatCompare(a, b, cmp) + "\n");
  return cmp.passed ? 0 : 1;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    process.stdout.write(USAGE);
    return 0;
  }
  if (cmd === "--version" || cmd === "-V" || cmd === "version") {
    process.stdout.write(`ratelab ${VERSION}\n`);
    return 0;
  }

  let positionals, flags;
  try {
    ({ positionals, flags } = parseArgs(rest));
  } catch (e) {
    usageError(e.message);
  }

  try {
    switch (cmd) {
      case "run":
        return await cmdRun(flags);
      case "serve":
        await cmdServe(flags);
        return null; // long-running
      case "compare":
        return cmdCompare(positionals, flags);
      default:
        usageError(`unknown command: ${cmd}`);
    }
  } catch (e) {
    usageError(e.message);
  }
  return 0;
}

const code = await main();
if (code !== null) process.exit(code);