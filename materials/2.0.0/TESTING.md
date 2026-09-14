# Hooky 2.0.0 — Manual acceptance

Status: **ready for your test; manual acceptance pending**.

Use [hooky-2.0.0.zip](hooky-2.0.0.zip) or the generated `unpacked/` directory. In Chrome, open `chrome://extensions/`, enable Developer mode, and choose Load unpacked. The ZIP is the submitted artifact; `unpacked/` is its exact local extraction and is not checked into Git. A fresh clone can extract the ZIP or run `bun run materials`.

Minimum Chrome: 127. The interactive HTML uses demo data; test real requests and captures in the installed extension.

1. Configure a receiving webhook you control, create a template with page URL/title/selection, and send from an ordinary page. Confirm the received values.
2. Edit a popup value before sending. Confirm your exact text arrives, including whitespace or literal `{{...}}` when used.
3. Try one matching Quick Send rule and one non-matching page, then send from the right-click menu.
4. Reopen settings and Chrome to confirm saved templates/rules. Check light/dark/system themes and one failure response.

Automated checks: 294 unit tests, the existing coverage gates, lint, repository E2E/workflow tests, and the production build passed. See [verification/build.json](verification/build.json) and its logs. Native clipboard interaction and real receiving services remain part of manual acceptance. R2 HTTP responses in the Chrome checks were simulated; no live R2 bucket or public CDN was used.

When reporting a result, include the Chrome version, tested ZIP SHA-256, reproduction steps, and expected/actual behavior. Keep credentials out of reports.

SHA-256: `9ad5a024f2907accb674542fabd5b3d7684b32758ca700d7d6c91536e6a5180c`
