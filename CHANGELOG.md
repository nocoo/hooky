# Changelog

All notable changes to Hooky will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.1.0]: https://github.com/nocoo/hooky/releases/tag/v1.1.0
[1.0.0]: https://github.com/nocoo/hooky/releases/tag/v1.0.0
