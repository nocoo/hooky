# 01 · 扩展与交付约定

详细行为与交付约定；日常命令、6DQ 状态及复盘入口见根 CLAUDE.md。



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
- A 20-second deadline applies until HTTP response headers arrive, followed by a separate 3-second budget for opted-in receipt reading; HTTP evidence remains separate from optional business confirmation

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


## Design and submission material ownership


- Generate Hooky deliverables from this repository using `bun run materials`; validate with `bun run materials:check`. Never depend on a sibling project or an external joint-delivery directory.
- Editable campaign inputs are in `materials/source/`; versioned ZIPs, English store copy, screenshots, banners, marquees, landing HTML and verification are in `materials/<version>/`. Keep generated `unpacked/` out of Git.
- Preserve the original logos and the historical concept/approved HTML in `docs/design/`. Each product owns its material outputs and is committed/pushed separately.
- Notify the user when the tested package is ready for manual acceptance. Use `TESTING.md`; do not record live R2/CDN or user acceptance as passed until actually verified.

## Release process


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
