# Privacy Policy — Hooky

Last updated: September 14, 2026 · Version 2.0.0

## Purpose

Hooky sends user-configured webhook requests using context from the current browser page. It is a product of hexly.ai. The publisher does not operate a relay, collect analytics, or receive the contents of your requests.

## Local data

Webhook templates, endpoint URLs, parameter values, rules, and theme preferences are stored in `chrome.storage.local`. They are not synced by Hooky and are removed when the extension is uninstalled. Template values may contain information you enter, including credentials; local extension storage is not a password vault.

## Page data and requests

When you open the popup or trigger a webhook, Hooky reads available page context: URL, title, selected text, description metadata, and Open Graph title, description, and image URL. Values appear in the popup and fill the variables you configured. Missing variables become empty strings. Hooky does not extract the complete page body, record browsing history, or run a persistent page script.

Requests are sent when you press Send, choose a context-menu template, or click the toolbar icon on a page matching an enabled Quick Send rule. Quick Send does not send merely because you visit a matching page.

The configured endpoint receives the request parameters, standard network information such as your IP address, and any data you included. Endpoint redirects follow the browser's Fetch behavior. The receiving service's storage and privacy practices are outside Hooky's control. Hooky does not proxy these requests or maintain a request history.

## Permissions

| Permission | Use |
| --- | --- |
| `activeTab` | Access the current tab after a user gesture to read page context. |
| `scripting` | Run the small context-extraction function on demand. |
| `storage` | Save templates, rules, and preferences locally. |
| `contextMenus` | Show configured templates in the browser's right-click menu. |
| `<all_urls>` host permission | Allow requests to user-configured HTTP/HTTPS endpoints across domains, including endpoints without browser CORS support. This broad capability is used for the configured webhook destinations; Hooky does not scan other tabs. |

Hooky requests no history, bookmarks, cookies, or downloads permission. It contains no analytics, advertising, remote executable code, account system, or publisher cloud sync. It does not sell data or use it for advertising. Links to hexly.ai and GitHub open only when clicked and are governed by those sites' policies.

## Control and contact

Edit or delete templates and rules in Settings; uninstall to remove the extension's local data. Data already sent must be managed with the receiving service. Policy updates are published in this repository. Questions: https://github.com/nocoo/hooky/issues
