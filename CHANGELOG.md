# Changelog

All notable changes to Hooky will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/nocoo/hooky/releases/tag/v1.0.0
