# Hooky — Project Instructions

## Overview

Hooky is a Chrome Extension (Manifest V3) for configuring and triggering webhook templates from the browser toolbar, context menu, or Quick Send mode. Built with vanilla JS (no framework), tested with Vitest + Puppeteer.

## Tech Stack

- **Runtime**: Chrome Extension (Manifest V3), vanilla JavaScript
- **Package manager**: Bun (NOT npm)
- **Test runner**: Vitest (`bun run test`, NOT `bun test` — the latter uses bun's built-in runner)
- **E2E**: Puppeteer
- **Lint**: ESLint v10, flat config (`eslint.config.mjs`)
- **Hooks**: Husky — pre-commit: `bun run test`, pre-push: `bun run test && bun run lint`
- **Module format**: `"type": "commonjs"` in package.json

## Architecture

### Storage Schema

Stored under `chrome.storage.local` key `"hooky"`:

```json
{
  "templates": [{ "id": "...", "name": "...", "url": "...", "method": "GET", "params": [...] }],
  "activeTemplateId": "...",
  "quickSend": false,
  "quickSendTemplateId": null,
  "theme": "system"
}
```

### Template Variables

Values in params can use: `{{page.url}}`, `{{page.title}}`, `{{page.selection}}`, `{{page.meta.description}}`, `{{page.meta.og:title}}`, `{{page.meta.og:description}}`, `{{page.meta.og:image}}`

### HTTP Methods

- GET, DELETE → query string parameters
- POST, PUT, PATCH → JSON body with `Content-Type: application/json`
- No custom headers support

### Page Context Extraction

Uses `chrome.scripting.executeScript()` to inject `extractPageContext()` from `src/pagecontext.js` on demand. No persistent content scripts. The `activeTab` permission grants temporary access when user clicks the extension icon or context menu item.

### Key Modules

| Module | Location | Purpose |
|--------|----------|---------|
| store | `src/store.js` | CRUD for templates, settings, legacy migration |
| template | `src/template.js` | Variable resolution engine |
| params | `src/params.js` | Request body/URL builder |
| webhook | `src/webhook.js` | HTTP request executor |
| rules | `src/rules.js` | Rule engine (matchRule, findMatchingRule) |
| quicksend | `src/quicksend.js` | Quick Send mode + badge feedback |
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
- 57 message keys, 2 with placeholders (`successStatus`, `failedStatus` use `$STATUS$`; `deleteConfirm` uses `$NAME$`)

## Testing

- 257 unit tests across 14 test files
- Coverage thresholds: 90% for statements, branches, functions, lines
- `jsdom` environment used for DOM tests (via `// @vitest-environment jsdom` directive)
- DOM-dependent modules (popup.js, options.js) do `document.getElementById()` at top level — tests must set up DOM before importing, using `vi.resetModules()`
- Content script can't run on `chrome://` pages — popup.js and quicksend.js have fallbacks

## Quality Gates

- Pre-commit: `bun run test` (257 unit tests)
- Pre-push: `bun run test && bun run lint`
- Coverage: 98% statements / 92% branches / 95% functions / 99% lines

## Version & Release Process

### Version Source of Truth

`manifest.json` → `"version"` field. Displayed in sidebar header via `chrome.runtime.getManifest().version`.

### Release Checklist

1. **Bump version** in `manifest.json` (the ONLY place to change version)
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

- Primary theme color: `#9666b7` (light), `#a97bcf` (dark)
- Headers use fixed `height: 57px`
- Select dropdowns use custom SVG polyline chevron with `appearance: none`
- Lightning icon for Quick Send target designation
- `chrome.action.onClicked` only fires when `default_popup` is empty — dynamically set/cleared via `applyQuickSendMode()`

## Retrospective

- **German locale Unicode quotes**: `„"` curly quotes break JSON parsing. Use `«»` instead.
- **`bun test` vs `bun run test`**: `bun test` invokes bun's built-in test runner, NOT vitest. Always use `bun run test`.
- **V8 coverage branch counting**: `||`, `?.`, and `&&` operators each count as branches. Defensive fallbacks like `x || ''` create uncoverable branches when x is always truthy in tests.
- **Content script limitations**: `chrome.scripting.executeScript` with `activeTab` is more reliable than persistent content_scripts, and avoids needing host permissions.
- **Top-level DOM access**: Modules that call `document.getElementById()` at import time require DOM fixtures before `import()` in tests.
- **ESM exports in src/**: All source files must use ESM `export` syntax (not `module.exports`) since ESLint config sets `sourceType: "module"` for `src/**/*.js`.
- **deleteCurrentRule editorMode**: After deleting a rule, keep `editorMode` as `"rule"` (not `null`) so `renderAll()` stays in rule context and shows empty state or selects next rule. Setting it to `null` causes `renderAll()` to fall through to template selection.
- **E2E CORS preflight**: Chrome extension popup sends CORS preflight (OPTIONS) for cross-origin POST requests. The E2E webhook server must handle OPTIONS with proper CORS headers, otherwise the actual POST never completes.
