# Privacy Policy

**Last updated:** February 17, 2026

## Overview

Hooky is a browser extension that lets you trigger webhook requests with page context data. Your privacy is important — Hooky is designed to work entirely on your device with no data collection.

## Data Collection

**Hooky does not collect, store, or transmit any personal data.**

Specifically:

- ❌ No analytics or telemetry
- ❌ No tracking scripts
- ❌ No cookies
- ❌ No account registration
- ❌ No data shared with third parties

## Local Storage

Hooky stores your webhook templates and settings locally in your browser using `chrome.storage.local`. This data:

- Never leaves your device unless you explicitly trigger a webhook
- Is not synced to any cloud service
- Is deleted when you uninstall the extension

## Network Requests

Hooky only makes HTTP requests to **URLs that you explicitly configure** in your webhook templates. No other network requests are made. Hooky does not contact any first-party or third-party servers.

## Permissions

| Permission | Purpose |
|---|---|
| `activeTab` | Read the current page URL, title, selected text, and meta tags when you trigger a webhook. This permission is scoped to the active tab only and does not grant access to other tabs or browsing history. |
| `scripting` | Inject a page context extraction function into the active tab on demand |
| `storage` | Save your webhook templates and settings locally |
| `contextMenus` | Add the "Hooky" right-click menu |
| `host_permissions: <all_urls>` | Send webhook requests to any URL you configure. Most webhook endpoints are designed for server-to-server communication and do not handle browser CORS preflight requests. Without this permission, POST requests with JSON content types would be silently blocked by the browser. Hooky only makes requests to URLs you explicitly set in your templates. |

## Page Content Access

When you trigger a webhook (via popup, context menu, or Quick Send), Hooky reads the following from the active tab:

- Page URL
- Page title
- Selected text
- Meta tags (description, Open Graph)

This data is used **only** to resolve template variables in your webhook parameters. It is sent **only** to the webhook URL you configured and is not stored or transmitted elsewhere.

## Changes

If this policy changes, the updated version will be posted in the [Hooky GitHub repository](https://github.com/nocoo/hooky).

## Contact

For questions about this policy, please open an issue at [github.com/nocoo/hooky](https://github.com/nocoo/hooky/issues).
