# Hooky 2.1.0 testing

This branch prepares an unreleased local test package. It does not publish to GitHub Releases or the Chrome Web Store. Historical 2.0.0 design and submission materials remain in `materials/2.0.0/`.

## Automated checks

```sh
bun install --frozen-lockfile
bun run test:coverage
bun run lint
bun run build
bun run test:e2e
```

Coverage gates remain at 95% for statements, branches, functions, and lines. Unit tests cover all five HTTP methods, template/literal separation, shared UUIDs, concurrent requests, worker recovery, header validation and redaction, bounded response streams, typed business conditions, duplicate protection, permission denial/revocation, transient capture expiry, and the shipped UI.

The Chrome suite launches a separate headless browser and a local receiver. It tests real extension messaging, requests and headers, session storage, page injection, and the production context-menu/Quick Send handlers. It copies runtime files to a temporary extension and adds a static worker driver there; no test entry points are packaged in Hooky. Use `EXTENSION_PATH` to test an unpacked build. Screenshots are written to `dist/verification/`.

## Local package and manual acceptance

`bun run build` creates `dist/hooky-2.1.0.zip`. Unzip it, then use **Load unpacked** in a separate Chrome profile. A build clears `dist/`, so run browser checks after building if you want to keep verification screenshots.

The following checks require a person using Chrome's toolbar, menus, permission prompts and OS notification settings. They are not recorded as accepted by the automated suite:

- [ ] Start with existing 2.0 templates/rules. Verify that headers, response reading, completed duplicate protection and desktop notifications remain off unless configured.
- [ ] Select text, use right-click → Hooky → a template, and deliberately miss the toast. Verify the persistent badge and **Latest send** entry make the outcome available without another request. Try both an ordinary webpage and a restricted Chrome page.
- [ ] Exercise the actual toolbar Quick Send gesture, then use **Open send panel** and **Latest send** without triggering its rule.
- [ ] Configure notifications for errors only, then all results. Accept and deny permission, revoke it, and restore it from the explicit settings button. Check actual OS delivery with and without Do Not Disturb. Notifications must contain no captured content, credentials or receipt text.
- [ ] Focus a parameter, click **Paste from clipboard**, and accept/deny permission. Nothing is sent automatically. Verify ordinary manual paste still works without that permission.
- [ ] Enable duplicate protection for one webhook. Repeat a capture, inspect the earlier result and masked preview, then choose **Send anyway**. The new request must use a new UUID. After the worker stops or the capture expires, the panel must ask for a fresh capture instead of substituting the current page.
- [ ] Inspect light/dark themes, keyboard focus, and long translated labels in the settings and result panel.

HTTP 2xx is evidence of a successful HTTP response. A configured business condition means only what the receiver promises. A lost response leaves the result unconfirmed; Hooky does not retry automatically. Durable storage and end-to-end idempotency still need receiver support.
