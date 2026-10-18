# Security Policy & Responsible Use

## What ratelab is

A load generator. It sends real HTTP traffic to a real URL at a rate you choose.
Like any measuring instrument, the impact comes from where you point it.

## Rules of use

- **Only load-test systems you own or have explicit written permission to test.**
  "It's on the internet" is not permission.
- The bundled demo server (`ratelab serve`) binds **127.0.0.1** and exists so
  every feature can be exercised offline against a target you control.
- Respect your program's agreed rate limits even when gates say you could push harder.
- ratelab follows redirects and reads full response bodies — treat results from
  untrusted endpoints accordingly (it reports bytes/status, it does not execute
  response content).

## Reporting vulnerabilities

If you find a security issue **in ratelab itself** (e.g. a way to make it send
traffic other than to the URL given, or a file-write path outside `--json`),
please open a private security advisory on the repository rather than a public
issue.

## Dependencies

None. The project is Node standard library only, so there is no third-party
supply chain to audit; `SECURITY.md`, tests, and source are the full surface.

## Trace of intent

- Tests and demos are loopback-only (127.0.0.1 ephemeral ports).
- No telemetry, no network calls besides the `--url` you pass in.
- `--json` writes only the path you specify.