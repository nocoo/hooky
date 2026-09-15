# Hooky — Project Instructions

## Overview

Hooky is a Chrome Extension (Manifest V3) for configuring and triggering webhook templates from the browser toolbar, context menu, or Quick Send mode. Built with vanilla JS (no framework), tested with Vitest + Puppeteer.

## Tech Stack

- **Runtime**: Chrome Extension (Manifest V3), vanilla JavaScript
- **Package manager**: Bun (NOT npm)
- **Test runner**: Vitest (`vitest run`)
- **E2E**: Puppeteer
- **Lint**: ESLint v10, flat config (`eslint.config.mjs`)
- **Hooks**: Husky — pre-commit: `bun run test:coverage && bun run lint`; pre-push: `bun run build && bun run test && bun run lint`
- **Module format**: `"type": "commonjs"` in package.json

## Architecture

### Storage Schema

Stored under `chrome.storage.local` key `"hooky"`:

```json
{
  "templates": [{ "id": "...", "name": "...", "url": "...", "method": "GET", "params": [], "headers": [], "response": { "enabled": false }, "duplicateWindow": 0 }],
  "activeTemplateId": "...",
  "quickSendRules": [],
  "theme": "system",
  "notificationMode": "off"
}
```

Advanced fields are optional; missing values preserve the old HTTP-only behavior. `response` can include `messagePath`, `receiptPath`, `successPath`, and a JSON scalar string `successValue`. `duplicateWindow` is 0/off or 1–300 seconds. Notification modes are `off`, `errors`, and `all`.

`chrome.storage.session` stores `hookyLastResult`, per-tab `hookyResult:<tabId>` summaries, and (only for enabled templates) up to 50 `hookyRecentSends` fingerprints/summaries. Raw request bodies and credentials are not stored there. Opted-in receipts are limited while streaming to 8 KiB and 3 seconds. Explicit duplicate repeats use captures held only in worker memory for at most 60 seconds; they are lost on worker restart.

### Template Variables

Values in params and headers can use: `{{page.url}}`, `{{page.title}}`, `{{page.selection}}`, `{{page.meta.description}}`, `{{page.meta.og:title}}`, `{{page.meta.og:description}}`, `{{page.meta.og:image}}`, `{{send.id}}`.

The send pipeline owns UUID generation. Header and body bindings share one logical send ID. Preserve the distinction between untouched templates (`resolve: true` in an already-resolved popup payload) and literal edited/pasted values. Never resolve captured variable syntax a second time. Hooky does not automatically retry requests or promise server-side idempotency.

### HTTP Methods

- GET, DELETE → query string parameters
- POST, PUT, PATCH → JSON body with `Content-Type: application/json`
- Optional custom headers per template, with masked previews and browser-managed header validation
- Custom-header requests use `redirect: "error"` to prevent credential forwarding
- A 20-second deadline yields an unconfirmed result on transport loss; HTTP evidence remains separate from optional business confirmation

### Page Context Extraction

Uses `chrome.scripting.executeScript()` to inject `extractPageContext()` from `src/pagecontext.js` on demand. No persistent content scripts. The `activeTab` permission grants temporary access when user clicks the extension icon or context menu item.

### Key Modules

| Module | Location | Purpose |
|--------|----------|---------|
| store | `src/store.js` | CRUD for templates, settings, legacy migration |
| template | `src/template.js` | Variable resolution engine |
| params | `src/params.js` | Request body/URL builder |
| webhook | `src/webhook.js` | HTTP request executor |
| send | `src/send.js` | Shared send identity, pending guard and result orchestration |
| feedback | `src/feedback.js` | Session summaries, badges, page/desktop feedback and recovery |
| response | `src/response.js` | Bounded receipt reads, safe JSON fields and business rules |
| duplicates | `src/duplicates.js` | Optional recent fingerprints and transient explicit repeats |
| rules | `src/rules.js` | Rule engine (matchRule, findMatchingRule) |
| quicksend | `src/quicksend.js` | Rule-based dispatch to the shared sending pipeline |
| contextmenu | `src/contextmenu.js` | Right-click menu management |
| background | `src/background.js` | Service worker orchestration |
| pagecontext | `src/pagecontext.js` | Page metadata extraction (injected) |
| i18n | `src/i18n.js` | `applyI18n()` + `t()` helpers |
| theme | `src/theme.js` | Theme switching (system/light/dark) |
| popup | `src/popup/` | Main popup UI |
| options | `src/options/` | Full-page options editor |

### i18n

- Uses `chrome.i18n` API exclusively (no runtime switching)
- 10 locales: `en`, `zh_CN`, `zh_TW`, `ja`, `ko`, `fr`, `de`, `es`, `pt_BR`, `ru`
- Message keys include placeholders (`successStatus`, `failedStatus` use `$STATUS$`; `deleteConfirm` uses `$NAME$`)

## Testing

- Unit tests cover core modules and the shipped popup/options HTML
- Coverage thresholds: 95% for statements, branches, functions, lines
- `jsdom` environment used for DOM tests (via `// @vitest-environment jsdom` directive)
- DOM-dependent modules (popup.js, options.js) do `document.getElementById()` at top level — tests must set up DOM before importing, using `vi.resetModules()`
- Content script can't run on `chrome://` pages — popup.js and quicksend.js have fallbacks
- E2E uses an isolated temporary extension copy with a statically imported worker driver. Dynamic `import()` is not supported inside MV3 service workers; test hooks must never enter the production package.
- Execution and transient capture-preview messages are accepted only from the extension's own popup URL. Page feedback may request opening the panel but cannot send or read captures.

## Quality Gates

- Pre-commit: `bun run test:coverage && bun run lint`
- Pre-push: `bun run build && bun run test && bun run lint`
- Coverage gates: 95% minimum for statements, branches, functions, and lines

## Version & Release Process

### Version Source of Truth

`manifest.json` → `"version"` field. Displayed in sidebar header via `chrome.runtime.getManifest().version`.

### Release Checklist

1. **Bump version** in `manifest.json` and keep `package.json` synchronized
2. **Update `CHANGELOG.md`** with new version entry following [Keep a Changelog](https://keepachangelog.com/) format
3. **Run full verification**: `bun run test && bun run lint`
4. **Commit**: `chore: bump version to X.Y.Z`
5. **Build zip**: `bash scripts/build.sh` → produces `dist/hooky-X.Y.Z.zip`
6. **Tag**: `git tag vX.Y.Z`
7. **Push**: `git push origin main && git push origin vX.Y.Z`
8. **GitHub Release**: `gh release create vX.Y.Z dist/hooky-X.Y.Z.zip --title "Hooky vX.Y.Z" --notes "..."`
9. **Chrome Web Store**: Upload zip at [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)

### Semantic Versioning

- **MAJOR** (X.0.0): Breaking changes to storage schema or dropped feature
- **MINOR** (0.X.0): New features (new template variable, new HTTP method, etc.)
- **PATCH** (0.0.X): Bug fixes, i18n corrections, UI polish

## Design Notes

- Primary theme: wisteria purple; native CSS variables in `src/ui.css`
- Shared compact controls, system fonts, and responsive options workspace
- Select dropdowns use custom SVG polyline chevron with `appearance: none`
- Lightning icon for Quick Send target designation
- `chrome.action.onClicked` only fires when `default_popup` is empty — dynamically set/cleared via `applyQuickSendMode()`

## Retrospective

- **German locale Unicode quotes**: `„"` curly quotes break JSON parsing. Use `«»` instead.
- **Test runner**: tests are run via `vitest run` (or `npm test`). The project no longer uses bun's built-in test runner.
- **V8 coverage branch counting**: `||`, `?.`, and `&&` operators each count as branches. Defensive fallbacks like `x || ''` create uncoverable branches when x is always truthy in tests.
- **Content script limitations**: `chrome.scripting.executeScript` with `activeTab` is more reliable than persistent content_scripts, and avoids needing host permissions.
- **Top-level DOM access**: Modules that call `document.getElementById()` at import time require DOM fixtures before `import()` in tests.
- **ESM exports in src/**: All source files must use ESM `export` syntax (not `module.exports`) since ESLint config sets `sourceType: "module"` for `src/**/*.js`.
- **deleteCurrentRule editorMode**: After deleting a rule, keep `editorMode` as `"rule"` (not `null`) so `renderAll()` stays in rule context and shows empty state or selects next rule. Setting it to `null` causes `renderAll()` to fall through to template selection.
- **E2E CORS preflight**: Chrome extension popup sends CORS preflight (OPTIONS) for cross-origin POST requests. The E2E webhook server must handle OPTIONS with proper CORS headers, otherwise the actual POST never completes.

## Design and submission material ownership

- Generate Hooky deliverables from this repository using `bun run materials`; validate with `bun run materials:check`. Never depend on a sibling project or an external joint-delivery directory.
- Editable campaign inputs are in `materials/source/`; versioned ZIPs, English store copy, screenshots, banners, marquees, landing HTML and verification are in `materials/<version>/`. Keep generated `unpacked/` out of Git.
- Preserve the original logos and the historical concept/approved HTML in `docs/design/`. Each product owns its material outputs and is committed/pushed separately.
- Notify the user when the tested package is ready for manual acceptance. Use `TESTING.md`; do not record live R2/CDN or user acceptance as passed until actually verified.
