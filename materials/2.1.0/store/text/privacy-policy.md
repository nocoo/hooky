# Privacy Policy — Hooky

Last updated: September 16, 2026 · Version 2.1.0

## Purpose

Hooky sends user-configured webhook requests using context from the current browser page. It is a product of hexly.ai. The publisher does not operate a relay, collect analytics, or receive the contents of your requests.

## Local data

Webhook templates, endpoint URLs, parameter values, custom request headers, rules, and theme preferences are stored in `chrome.storage.local`. They are not synced by Hooky and are removed when the extension is uninstalled. Template values may contain information you enter, including credentials; local extension storage is not a password vault. Header values are hidden until explicitly revealed in settings and are always masked in request previews. Manual edits in the send panel are used for that send without changing the saved template.

`chrome.storage.session` holds the latest send summary globally and for each sending tab: a random send ID, template ID and name, tab ID, entry point, timestamps, and request outcome. By default it does not contain request bodies, page selections, credentials, or response bodies. Chrome clears this session data on browser restart or extension reload, update, or disable. Background worker restarts preserve the summary; interrupted sends become unconfirmed and are not replayed.

Response reading is off by default and enabled separately for each template. When enabled, Hooky reads at most 8 KiB of response bytes for up to 3 seconds and retains the resulting text with the session summary. Receipts are shown as plain text only inside the extension, never inserted into page feedback. A receiver may include sensitive data in its response, including echoed request content. Empty, invalid, unsupported, truncated, or unavailable response bodies do not change the HTTP outcome.

Optional JSON field mappings and business success rules are stored with their template. Extracted messages and receipt IDs are limited to 1,000 characters each and retained only with the opted-in session receipt. Field traversal reads own JSON properties and does not execute expressions or code. A business rule can report failure or an unconfirmed outcome while preserving the underlying HTTP status.

Completed duplicate protection is also off by default and enabled per template. It uses SHA-256 request fingerprints and up to 50 recent summaries in session storage, including receipts only when response reading was enabled. Comparison windows range from 1 to 300 seconds; expired entries are pruned on subsequent use. Raw requests and credentials are not stored in this history. When a duplicate is blocked, up to 20 original captures may be held only in background memory for **Send anyway**, for at most 60 seconds or until the worker stops. The extension panel can request a masked preview of that capture; page scripts cannot retrieve it or execute a send. Explicit repeats use a new send ID; automatic replay is never performed.

Notification preferences are also stored locally and default to off. You can choose errors/unconfirmed results or all results. If enabled and permitted, desktop notifications show only the template name and generic status, never captured text, credentials, or receipts. Missing browser permission is shown in Settings with an explicit button to request access again; your preference is retained. Browser and OS settings can suppress notifications; badges and the result panel remain available. Switching notifications off stops delivery; previously granted permissions can also be revoked in Chrome's extension settings.

## Page data and requests

When you open the popup or trigger a webhook, Hooky reads available page context: URL, title, selected text, description metadata, and Open Graph title, description, and image URL. Values appear in the popup and fill the variables you configured. Missing variables become empty strings. Hooky does not extract the complete page body, record browsing history, or run a persistent page script.

Requests are sent when you press Send, choose a context-menu template, or click the toolbar icon on a page matching an enabled Quick Send rule. Quick Send does not send merely because you visit a matching page.

You can type or use the browser's standard paste command in parameter fields. Hooky does not request clipboard permissions or read the clipboard programmatically. Entered text is sent only when you choose to send.

The configured endpoint receives the request parameters and headers, standard network information such as your IP address, and any data you included. Requests with custom headers refuse redirects to avoid forwarding credentials; other requests follow the browser's Fetch behavior. The receiving service's storage and privacy practices are outside Hooky's control. Hooky does not proxy these requests or maintain a persistent request history.

After a user-triggered send, a small temporary page UI may show the template name and generic request status. Page feedback does not receive request bodies or credentials. Restricted pages fall back to the extension's panel. HTTP success does not prove that the receiving service durably saved the data.

## Permissions

| Permission | Use |
| --- | --- |
| `activeTab` | Access the current tab after a user gesture to read page context. |
| `scripting` | Run the small context-extraction function on demand. |
| `storage` | Save templates, rules, and preferences locally. |
| `contextMenus` | Show configured templates in the browser's right-click menu. |
| `notifications` (optional) | Show generic desktop feedback after explicitly enabling it in Settings. |
| `<all_urls>` host permission | Allow requests to user-configured HTTP/HTTPS endpoints across domains, including endpoints without browser CORS support. This broad capability is used for the configured webhook destinations; Hooky does not scan other tabs. |

Hooky requests no history, bookmarks, cookies, or downloads permission. It contains no analytics, advertising, remote executable code, account system, or publisher cloud sync. It does not sell data or use it for advertising. Links to hexly.ai and GitHub open only when clicked and are governed by those sites' policies.

## Control and contact

Edit or delete templates and rules in Settings; uninstall to remove the extension's local data. Data already sent must be managed with the receiving service. Policy updates are published in this repository. Questions: https://github.com/nocoo/hooky/issues
