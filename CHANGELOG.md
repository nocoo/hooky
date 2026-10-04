# Changelog

All notable changes to Hooky will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.0] - 2026-10-04

### Added

- A task-focused popup with a compact brand/version header, independently scrolling content, and a footer that keeps the active action and send result visible.
- Dedicated setup and load-recovery states, pre-send template validation with an edit action, and a focused duplicate-capture review with an explicit Send anyway action.
- Native action-popup regression coverage, computed typography checks, and exact comparisons against the copied Lucide SVG originals.

### Changed

- Use only 10px, 12px and 14px typography across popup, settings and page feedback. Buttons use uppercase labels and official Lucide icons without adding a runtime dependency.
- Keep fresh send panels free of historical results. Latest send, notifications and page feedback explicitly open the retained-result view; session history is preserved.
- Distinguish HTTP 202 and unconfirmed outcomes with warning colors, keep response details collapsible, and provide authorization guidance without automatic retries.
- Simplify settings branding, move its version below the hexly.ai signature, and show the runtime version beside the popup title.
- Update jsdom to 30.1.1, Puppeteer to 25.12.0, Vitest and coverage-v8 to 5.0.3, and the brace-expansion/undici overrides to 5.0.12/8.10.2.

### Fixed

- Remove viewport-dependent bounds that trapped native Chrome action popups at their initial 25px size.
- Override Chrome's injected 75% body font so form labels and input values consistently render at 12px.
- Avoid duplicate success notifications, raw transport diagnostics, and unrelated session updates replacing a fresh popup's result.
- Preserve SVG icons through translation updates and switch complete icons for busy and result states.

## [2.1.1] - 2026-09-22

### Fixed

- Run pre-commit coverage and lint against the Git index snapshot, so a staged fault is rejected even when the worktree copy is already corrected.
- Reject focused, skipped, todo, and empty Vitest runs. Native coverage floors remain 95% for statements, branches, functions, and lines.

### Changed

- Update the development toolchain to Vitest 5.0.1, ESLint 10.11.0, and jsdom 30.1.0, and keep the existing Rollup override.

## [2.1.0] - Unreleased

### Added

- Shared sending, success, rejection, and unconfirmed-result feedback for popup, Quick Send, and context-menu sends.
- Page notifications, persistent toolbar badges, and a session-only latest-result panel with independent view/open actions.
- A pending-request guard and a 20-second deadline for HTTP response headers; interrupted requests are never replayed automatically.
- Per-template custom headers with validation, masked previews, and redirect protection.
- A `{{send.id}}` UUID variable shared by request headers and parameters, without resolving captured or edited literals again.
- Multiline manual capture and a request preview in the send panel.
- Optional per-template response reading, bounded while streaming to 8 KiB and 3 seconds, with plain-text session-only receipt display.
- Opt-in desktop notification modes, with permission requested when enabled in Settings.
- Optional JSON message/receipt field mappings and type-sensitive business success rules that preserve the HTTP outcome as separate evidence.
- Per-template completed duplicate protection with bounded session fingerprints, a configurable window, and an explicit Send anyway action backed by a short-lived in-memory capture.

### Changed

- Distinguish settings navigation groups from nested items with animated expansion, chevrons, indentation, and accessible collapsed states.
- Align controls and parameter rows, including multiline values, headers, checkboxes, and narrow layouts.
- Show settings save outcomes in a dismissible card: success stays for eight seconds and errors remain until dismissed or edited. Theme save failures restore the previous preference.
- Restyle capture feedback with status icons, light/dark colors, and reduced-motion support; focused or hovered success notifications defer dismissal until interaction ends.
- Shorten the view-only menu action to **Preview send**, with corresponding labels in all 10 locales.
- Use native typing and paste for manual capture without requesting clipboard access.

### Fixed

- Preserve the selection supplied by a context-menu event, including selections inside frames.
- Keep older completions from replacing a newer send's result or badge.
- Keep stalled page feedback from delaying transport or overwriting a final outcome.
- Coalesce identical pending requests across tabs, preserve the latest observed action, and restrict capture previews and execution messages to the extension's send panel.
- Show missing notification permission and offer explicit reauthorization while retaining the user's preference.
- Keep GET/DELETE parameters ahead of URL fragments and ignore fragments and unused rows when guarding identical requests.
- Give optional receipt reading its full 3-second budget after late HTTP headers arrive, without the earlier request deadline aborting the stream.

## [2.0.0] - 2026-09-14

### Added

- Compact wisteria popup and settings workspace, with subtle hexly.ai family attribution.
- Current-page context card, request preview, clickable template variables, and multiline parameter editing.
- Rule sample testing and explicit up/down priority controls.
- Updated interface strings in all 10 locales and Chrome 127 minimum version.

### Changed

- Preserve the original identity, storage schema, templates, rules, and three theme modes.
- Keep the extension runtime in native JavaScript, HTML, and CSS with system fonts.
- Synchronize manifest and package versions at 2.0.0.

### Fixed

- Preserve literal variable syntax and whitespace in values edited in the popup, without resolving them twice.
- Select a valid fallback template if the stored active template was removed.
- Surface storage failures and prevent repeated saves while a write is pending.
- Update the browser test launcher for current Chrome extension installation APIs.

## [1.1.1] - 2026-02-17

### Fixed

- Add `host_permissions: <all_urls>` to allow webhook requests to any URL without CORS restrictions — most webhook endpoints are designed for server-to-server use and do not handle browser CORS preflight requests

## [1.1.0] - 2026-02-17

### Added

- Quick Send Rules: conditional rules that match page URL or title to automatically select which webhook to fire
- Rule matching fields: URL, Title
- Rule matching operators: contains, equals, starts with, ends with, matches (regex)
- Case-insensitive matching for all operators
- First-match-wins evaluation: rules are checked in order, first match fires immediately
- Fallback to popup when no rule matches the current page
- Options page redesigned with 3-panel accordion sidebar (Templates, Rules, Settings)
- Rule editor form with field, operator, value, template dropdown, and enabled toggle
- 20 new i18n keys across all 10 locales for rules UI
- E2E tests for rules accordion, rule CRUD, and rule editor
- Store descriptions updated for all 10 languages

### Changed

- Quick Send mode replaced by rules-based dispatch — `quickSend` boolean and `quickSendTemplateId` fields removed from storage schema
- `manifest.json` `default_popup` set to empty string so `chrome.action.onClicked` always fires
- Background service worker now evaluates rules on toolbar click instead of using a fixed Quick Send template

### Fixed

- E2E webhook server now handles CORS preflight requests correctly
- Popup resets correctly after fallback so `onClicked` continues to fire on subsequent clicks
- Delete button repositioned to left side of editor actions for better UX

## [1.0.0] - 2026-02-17

### Added

- Multi-template webhook management with full CRUD operations
- Template variables: `{{page.url}}`, `{{page.title}}`, `{{page.selection}}`, `{{page.meta.description}}`, `{{page.meta.og:title}}`, `{{page.meta.og:description}}`, `{{page.meta.og:image}}`
- Key-value parameter editor with add/remove rows
- HTTP methods: GET, DELETE (query string), POST, PUT, PATCH (JSON body)
- Quick Send mode for one-click webhook firing from toolbar icon
- Badge flash feedback (checkmark/cross) for Quick Send results
- Context menu integration listing all templates under "Hooky" parent menu
- Theme switching: System, Light, Dark (purple accent `#9666b7`)
- Internationalization via `chrome.i18n` API for 10 languages: English, Simplified Chinese, Traditional Chinese, Japanese, Korean, French, German, Spanish, Portuguese (Brazil), Russian
- Legacy single-webhook storage format auto-migration
- On-demand page context extraction via `chrome.scripting.executeScript`
- Version display in sidebar header from `manifest.json`
- Privacy policy documenting all permission usage

[2.2.0]: https://github.com/nocoo/hooky/releases/tag/v2.2.0
[2.1.1]: https://github.com/nocoo/hooky/releases/tag/v2.1.1
[1.1.1]: https://github.com/nocoo/hooky/releases/tag/v1.1.1
[1.1.0]: https://github.com/nocoo/hooky/releases/tag/v1.1.0
[1.0.0]: https://github.com/nocoo/hooky/releases/tag/v1.0.0
