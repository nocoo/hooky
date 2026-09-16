# Hooky 2.1.0 — Manual acceptance

Status: **ready for your test; manual acceptance pending**.

Use [hooky-2.1.0.zip](hooky-2.1.0.zip) or the generated `unpacked/` directory. In Chrome, open `chrome://extensions/`, enable Developer mode, and choose Load unpacked. The ZIP is the submitted artifact; `unpacked/` is its exact local extraction and is not checked into Git. A fresh clone can extract the ZIP or run `bun run materials`.

Minimum Chrome: 127. The interactive HTML uses demo data; test real requests and captures in the installed extension.

1. Configure a receiving webhook you control, create a template with page URL/title/selection, and send from an ordinary page. Confirm the received values.
2. Edit a popup value before sending. Confirm your exact text arrives, including whitespace or literal `{{...}}` when used.
3. Try one matching Quick Send rule and one non-matching page, then send from the right-click menu.
4. Reopen settings and Chrome to confirm saved templates/rules. Check light/dark/system themes and one failure response.
5. Miss a context-menu success toast, then inspect the persistent badge and Latest send without sending again. Try a restricted Chrome page too.
6. Configure headers and a shared send UUID for one webhook. Enable receipts and test HTTP failure, a matching business condition, and an unreadable response. Verify previews hide credentials.
7. Enable completed duplicate protection for one webhook. Inspect the previous result and masked capture, then choose Send anyway. It must use a new UUID. Repeat after the worker stops to check capture expiry.
8. Enable, deny, revoke, and restore optional notification permission. Check actual OS delivery and Do Not Disturb. Paste text into a parameter using the browser's standard paste command; it must not request permission or send automatically.

See [the full 2.1 acceptance checklist](../../TESTING.md) for details. System notification presentation and native permission dialogs remain pending manual acceptance.

Automated checks: 461 unit tests, the existing coverage gates, lint, repository E2E/workflow tests, and the production build passed. See [verification/build.json](verification/build.json) and its logs. Local HTTP receiver; isolated Chrome profile. Native paste interaction, OS notifications, and your own receiving service remain part of manual acceptance.

When reporting a result, include the Chrome version, tested ZIP SHA-256, reproduction steps, and expected/actual behavior. Keep credentials out of reports.

SHA-256: `24db83888f0b4981763f0524e0673caedf6bba2a35ca3aacde181cce9c4cedb4`
