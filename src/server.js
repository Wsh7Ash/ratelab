// Local demo target server for offline testing and demos.
// Routes:
//   /ok       200 after a small fixed delay (default 5ms)
//   /slow     200 after ?ms= (default 250ms)
//   /error    always 500
//   /flaky    every 3rd request returns 500, otherwise 200
//   /bytes    200 with ?size= bytes (default 1024)
//   anything else -> 404

import http from "node:http";

export function createDemoServer({ fixedMs = 5 } = {}) {
  let counter = 0;
  const server = http.createServer((req, res) => {
    counter += 1;
    const url = new URL(req.url, "http://localhost");
    const num = (name, dflt) => {
      const v = Number(url.searchParams.get(name));
      return Number.isFinite(v) ? v : dflt;
    };
    const reply = (status, body, headers = {}) => {
      res.writeHead(status, { "content-type": "text/plain", ...headers });
      res.end(body);
    };
    const later = (ms, fn) => setTimeout(fn, Math.max(0, ms));

    switch (url.pathname) {
      case "/ok":
        return later(fixedMs, () => reply(200, "ok"));
      case "/slow":
        return later(num("ms", 250), () => reply(200, "slow"));
      case "/error":
        return later(fixedMs, () => reply(500, "boom"));
      case "/flaky":
        return later(fixedMs, () =>
          counter % 3 === 0 ? reply(500, "flaky boom") : reply(200, "ok"));
      case "/bytes": {
        const size = Math.max(0, Math.min(num("size", 1024), 1_000_000));
        return later(fixedMs, () =>
          reply(200, "x".repeat(size), { "content-type": "application/octet-stream" }));
      }
      default:
        return reply(404, "not found");
    }
  });

  return {
    server,
    listen(port = 0) {
      return new Promise((resolve) => {
        server.listen(port, "127.0.0.1", () => resolve(server.address().port));
      });
    },
    close() {
      return new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
    },
  };
}