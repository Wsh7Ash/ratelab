import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDemoServer } from "../src/server.js";

const CLI = fileURLToPath(new URL("../src/cli.js", import.meta.url));
// Async spawn: a spawnSync would block this process's event loop and the
// in-process demo server could not answer the CLI child's requests.
const runCli = (...args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`cli hung: ${args.join(" ")}`));
    }, 30_000);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ status: signal ? -1 : code, stdout, stderr });
    });
  });

let demo;
let base;
let scratch;

test.before(async () => {
  demo = createDemoServer();
  const port = await demo.listen(0);
  base = `http://127.0.0.1:${port}`;
  scratch = mkdtempSync(join(tmpdir(), "ratelab-cli-"));
});

test.after(async () => {
  await demo.close();
  rmSync(scratch, { recursive: true, force: true });
});

test("run exits 0 and prints a report with passing gates", async () => {
  const r = await runCli("run", "--url", `${base}/ok`, "--rps", "30", "--duration", "750ms",
    "--concurrency", "16", "--p99-max", "5000", "--error-rate-max", "1", "--rps-min", "1");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ratelab report/);
  assert.match(r.stdout, /p99/);
  assert.match(r.stdout, /PASS\s+p99Max/);
});

test("run exits 1 when a gate fails", async () => {
  const r = await runCli("run", "--url", `${base}/error`, "--rps", "25", "--duration", "700ms",
    "--error-rate-max", "1");
  assert.equal(r.status, 1, `expected gate failure exit, got ${r.status}`);
  assert.match(r.stdout, /FAIL\s+errorRateMax/);
});

test("run --json writes a parseable run file", async () => {
  const file = join(scratch, "run.json");
  const r = await runCli("run", "--url", `${base}/ok`, "--rps", "25", "--duration", "600ms",
    "--json", file);
  assert.equal(r.status, 0, r.stderr);
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(parsed.tool, "ratelab");
  assert.ok(parsed.summary.count > 0);
  assert.ok(parsed.summary.latency.p99 >= 0);
  assert.ok(parsed.profile.segments.length >= 1);
});

test("compare of a run with itself reports no regression", async () => {
  const file = join(scratch, "same.json");
  await runCli("run", "--url", `${base}/ok`, "--rps", "20", "--duration", "500ms", "--json", file);
  const r = await runCli("compare", file, file);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /no regression/);
});

test("compare exits 1 when the candidate regressed", async () => {
  const baseline = {
    tool: "ratelab", version: "1.0.0",
    meta: { url: "http://a/ok" },
    profile: { type: "constant", durationMs: 3000, segments: [{ until: 3000, rps: 50 }] },
    summary: {
      count: 150, failed: 0, errorRate: 0, timeouts: 0, statusCounts: { 200: 150 },
      latency: { min: 5, max: 40, mean: 10, stddev: 3, p50: 9, p90: 25, p95: 30, p99: 38 },
      throughput: { wallMs: 3000, rps: 50, bytesTotal: 1500, mibPerSec: 0.0005 },
    },
    gates: { passed: true, checks: [] },
  };
  const candidate = structuredClone(baseline);
  candidate.meta.url = "http://b/ok";
  candidate.summary.latency.p99 = 380;
  candidate.summary.throughput.rps = 30;
  candidate.summary.errorRate = 0.25;

  const a = join(scratch, "baseline.json");
  const b = join(scratch, "candidate.json");
  writeFileSync(a, JSON.stringify(baseline, null, 2));
  writeFileSync(b, JSON.stringify(candidate, null, 2));

  const r = await runCli("compare", a, b, "--max-regress", "10");
  assert.equal(r.status, 1, "regressed comparison must exit 1");
  assert.match(r.stdout, /FAIL: regressed metrics: p99, rps, errorRate/);

  const lenient = await runCli("compare", a, b, "--max-regress", "10000");
  assert.equal(lenient.status, 0, "a huge threshold should pass");
});

test("usage errors exit 2", async () => {
  assert.equal((await runCli("run")).status, 2, "missing --url");
  assert.equal((await runCli("nonsense")).status, 2, "unknown command");
  assert.equal((await runCli("run", "--url")).status, 2, "flag without value");
  const bad = await runCli("run", "--url", `${base}/ok`, "--rps", "abc");
  assert.equal(bad.status, 2, "--rps abc must be rejected: " + bad.stderr);
});

test("help and version print usage info", async () => {
  const help = await runCli("help");
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage:/);
  const ver = await runCli("--version");
  assert.equal(ver.status, 0);
  assert.match(ver.stdout, /ratelab 1\.0\.0/);
});

test("serve listens on the requested port and serves /ok", async () => {
  const child = spawn(process.execPath, [CLI, "serve", "--port", "0"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("serve did not start")), 5000);
      let buf = "";
      child.stdout.on("data", (chunk) => {
        buf += chunk;
        const m = /listening on http:\/\/127\.0\.0\.1:(\d+)/.exec(buf);
        if (m) {
          clearTimeout(timer);
          resolve(Number(m[1]));
        }
      });
      child.on("exit", (code) => reject(new Error(`serve exited early: ${code} ${buf}`)));
    });
    const res = await fetch(`http://127.0.0.1:${port}/ok`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "ok");
    const missing = await fetch(`http://127.0.0.1:${port}/nope`);
    assert.equal(missing.status, 404);
  } finally {
    child.kill();
  }
});