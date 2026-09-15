<p align="center">
  <img src="../assets/brand/icon-rounded.png" width="128" height="128" alt="Hooky logo" />
</p>
<h1 align="center">Hooky</h1>
<p align="center">Send page context to a configured webhook from Chrome's toolbar or context menu.</p>
<p align="center">
  <a href="https://chromewebstore.google.com/detail/hooky/almccnkbhfhckimediabjimflnbfbeeo">Chrome Web Store</a> ·
  <a href="../README.md">简体中文</a>
</p>

## What it does

Hooky is a Chrome extension for saving webhook templates and sending a page URL, title, selected text, or metadata while browsing. Select a template in the popup, use the page context menu, or configure quick-send rules that run when you click the toolbar icon.

Templates, rules, and appearance settings stay in local browser storage. The extension sends requests to your configured endpoints; parameter templates determine which page data enters each request. No account is required, and you provide the receiving webhook service.

## Version 2.0.0

A compact wisteria workspace in the hexly.ai family, with a current-page card, editable popup values, a request preview, click-to-insert variables, and a rule tester with priority controls. Existing templates, rules, and preferences are retained. Requires Chrome 127 or later.

## Features

- **Multiple templates**: Save a name, target URL, HTTP method, and key-value parameters for each webhook.
- **Page variables**: Reference page context in parameter values and resolve it when sending.
- **Quick-send rules**: On a toolbar click, match the page URL or title in order. Send through the first enabled matching rule when its template is valid; otherwise open the popup.
- **Context menu sending**: Choose a template from the right-click menu on a page, selection, link, or image.
- **Result feedback**: All entry points show sending, success, receiver errors, or unconfirmed results. Quick-send and context menu actions show page feedback and persistent badges; the panel retains the latest result for this browser session.
- **Appearance and language**: System, light, and dark themes. The UI follows Chrome's language and includes English, Chinese, and other locales.

Rules support contains, equals, starts-with, ends-with, and regular-expression matching, without case sensitivity. Page variables include:

| Variable | Value |
| --- | --- |
| `{{page.url}}` | Page URL |
| `{{page.title}}` | Page title |
| `{{page.selection}}` | Current selection |
| `{{page.meta.description}}` | Description metadata |
| `{{page.meta.og:title}}` | Open Graph title |
| `{{page.meta.og:description}}` | Open Graph description |
| `{{page.meta.og:image}}` | Open Graph image URL |

GET and DELETE place parameters in the query string. POST, PUT, and PATCH send a JSON object whose parameter values are strings. Custom HTTP headers are not supported. Pages that block script injection, such as Chrome's internal pages, fall back to available tab information; selection and metadata may be empty.

## Usage

Install from the Chrome Web Store link above, or load the source as described under Development.

1. Open the extension's options page, create a webhook template, and enter your endpoint URL and HTTP method.
2. Add parameters such as `url = {{page.url}}` and `title = {{page.title}}`, then save.
3. Open a webpage and send using the template in the popup or context menu.
4. For one-click sending, create an enabled rule with a URL or title condition and an associated template.

The page and extension-icon context menus include **Open send panel** and **Latest send**; these actions never run quick-send rules. Identical pending requests for the same template and tab share one send. After completion you can send again. Requests time out after 20 seconds; a timeout or lost connection leaves the result unconfirmed, so check the receiver before sending again. Hooky never retries automatically. HTTP success confirms a successful response, not durable business storage.

For example, POST with those two parameters sends:

```json
{
  "url": "https://example.com/article",
  "title": "Example article"
}
```

Permissions cover page context access, script injection, local storage, context menus, and `<all_urls>` host access for sending to custom endpoints. Page context is read when the user triggers an action. See the [privacy policy](../PRIVACY.md).

## Development

Development checks require Bun, Node.js 24, and Chrome. Runtime files are JavaScript, HTML, and CSS, with no frontend framework or compilation step.

```bash
git clone https://github.com/nocoo/hooky.git
cd hooky
bun install --frozen-lockfile
```

Enable Developer mode at `chrome://extensions/`, click **Load unpacked**, and select the repository root. Reload the extension from that page after code changes.

```bash
bun run lint
bun run build
```

The build command packages `manifest.json`, `_locales/`, and `src/` into `dist/hooky-<version>.zip`, using the manifest version. It creates the ZIP without submitting a store release.

| Path | Contents |
| --- | --- |
| [src/options](../src/options) | Template, rule, and settings editor |
| [src/popup](../src/popup) | Template selection and sending panel |
| [src/background.js](../src/background.js) | Event dispatch and request coordination |
| [src/pagecontext.js](../src/pagecontext.js) | On-demand page context collection |
| [src/store.js](../src/store.js) | Local template and rule storage |

## Tests

```bash
bun run test
bun run test:e2e
```

Unit tests cover templates, parameters, rules, storage, UI, and request logic. Puppeteer end-to-end tests launch a separate browser and a temporary local webhook receiver to check configuration saving, sending, and rule editing. They run in a separate headless Chrome profile. Use Puppeteer’s installed browser, or set `PUPPETEER_EXECUTABLE_PATH` to a compatible local Chrome executable (Chrome 137+ for the development installation API).

If the test browser is missing after installation, run:

```bash
bunx puppeteer browsers install chrome
```

## Stack

| Technology | Role |
| --- | --- |
| JavaScript / HTML / CSS | Extension logic and UI |
| Chrome Extensions Manifest V3 | Service worker, toolbar, page scripts, and context menus |
| chrome.storage.local | Templates, rules, and appearance settings |
| Fetch API | Webhook requests |
| Vitest / jsdom | Unit and DOM tests |
| Puppeteer | Browser end-to-end tests |

## Documentation

- [Privacy policy](../PRIVACY.md)
- [Changelog](../CHANGELOG.md)
- [Request parameter handling](../src/params.js)
- [Rule matching](../src/rules.js)

A product of [hexly.ai](https://hexly.ai).

## License

[MIT](../LICENSE)

## Design and submission materials

[Concepts and approved family designs](design/README.md) · [Hooky 2.0.0 gallery](../materials/2.0.0/index.html) · [Manual testing](../materials/2.0.0/TESTING.md)

Run `bun run materials` from this repository to generate its own tested package, English store copy, promotional assets and standalone website. Original artwork, prompts and design references are retained. See [the directory and reproduction guide](../materials/README.md).
