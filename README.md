<p align="center">
  <img src="assets/hooky-max.png" width="128" height="128" alt="Hooky logo">
</p>

<h1 align="center">Hooky</h1>

<p align="center">
  🪝 One-click webhook trigger with page context and template variables
</p>

<p align="center">
  <img src="https://img.shields.io/badge/manifest-v3-blue" alt="Manifest V3">
  <img src="https://img.shields.io/badge/coverage-93%25-brightgreen" alt="Coverage 93%">
  <img src="https://img.shields.io/badge/tests-188_passing-brightgreen" alt="188 tests passing">
  <img src="https://img.shields.io/badge/license-ISC-blue" alt="License ISC">
</p>

---

## ✨ Features

- 🪝 **Multiple webhook templates** — create, edit, and manage named templates with URL, HTTP method, and key-value parameters
- 🔀 **Template variables** — dynamically inject page context into parameter values:

  | Variable | Description |
  |---|---|
  | `{{page.url}}` | Current page URL |
  | `{{page.title}}` | Page title |
  | `{{page.selection}}` | Selected text |
  | `{{page.meta.description}}` | Meta description |
  | `{{page.meta.og:title}}` | Open Graph title |
  | `{{page.meta.og:description}}` | Open Graph description |
  | `{{page.meta.og:image}}` | Open Graph image |

- ⚡ **Quick Send** — click the toolbar icon to instantly fire a designated template; badge flashes ✓ or ✗ for feedback
- 📋 **Context menu** — right-click on any page to trigger webhooks from the "Hooky" menu
- 🎨 **Themes** — system / light / dark
- 🌐 **i18n** — 10 languages: English, 简体中文, 繁體中文, 日本語, 한국어, Français, Deutsch, Español, Português (BR), Русский

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh/) v1.x+
- Google Chrome

### Install

```sh
bun install
```

> The `prepare` script automatically runs `husky` to set up Git hooks.

### Load in Chrome

1. Navigate to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the project root

---

## 🛠️ Development

### Scripts

| Command | What it does |
|---|---|
| `bun run test` | 🧪 Run unit tests (Vitest) |
| `bun run test:watch` | 👀 Run tests in watch mode |
| `bun run test:coverage` | 📊 Run tests with V8 coverage report (90% threshold) |
| `bun run lint` | 🔍 Lint `src/` and `tests/` with ESLint |
| `bun run test:e2e` | 🌐 Run Puppeteer E2E tests |
| `bun run build` | 📦 Package extension into `dist/hooky-<version>.zip` |

### Git Hooks (Husky) 🐶

Hooks live in `.husky/` and are shared across the team via Git.

| Stage | Command | Purpose |
|---|---|---|
| `pre-commit` | `bun run test` | ✅ Catch regressions before commit |
| `pre-push` | `bun run test && bun run lint` | ✅ Full quality gate before push |

### Test Coverage 📊

Coverage is enforced at **90%** for all four metrics:

```
-----------------|---------|----------|---------|---------|
File             | % Stmts | % Branch | % Funcs | % Lines |
-----------------|---------|----------|---------|---------|
All files        |   98.09 |    93.22 |   92.68 |   99.53 |
-----------------|---------|----------|---------|---------|
```

### Project Structure 📁

```
hooky/
├── 🌐 _locales/           # i18n messages (10 languages)
├── 🖼️ assets/              # Logo, store descriptions, promo images
├── 🐶 .husky/             # Git hooks (pre-commit, pre-push)
├── 🔧 scripts/            # Utility scripts (icon generation)
├── 📦 src/
│   ├── background.js      # Service worker — startup, message routing
│   ├── content.js         # Content script — page context extraction
│   ├── contextmenu.js     # Context menu setup & click handling
│   ├── i18n.js            # i18n helpers (applyI18n, t)
│   ├── icons/             # Extension icons (16–256px)
│   ├── options/           # ⚙️ Settings page (HTML, CSS, JS)
│   ├── params.js          # Request body / URL builder
│   ├── popup/             # 🪟 Toolbar popup (HTML, CSS, JS)
│   ├── quicksend.js       # ⚡ Quick Send with badge feedback
│   ├── store.js           # Storage CRUD, migration, settings
│   ├── template.js        # Template variable resolution engine
│   ├── theme.js           # 🎨 Theme switching (system/light/dark)
│   └── webhook.js         # HTTP request executor
├── 🧪 tests/
│   ├── *.test.js          # Unit tests (Vitest + jsdom)
│   └── e2e/               # Puppeteer E2E tests
├── manifest.json          # Chrome Extension Manifest V3
├── vitest.config.js       # Vitest + coverage config
├── eslint.config.mjs      # ESLint flat config
└── package.json           # Scripts & dev dependencies
```

---

## 📦 Publishing to Chrome Web Store

### Build

```sh
bun run build
```

This produces `dist/hooky-<version>.zip` containing only the runtime files needed by Chrome.

### Store Assets

| Asset | Location | Status |
|---|---|---|
| 📝 Description (EN) | `assets/description-en.txt` | ✅ |
| 📝 Description (ZH) | `assets/description-zh.txt` | ✅ |
| 📝 Description (JA) | `assets/description-ja.txt` | ✅ |
| 📝 Description (KO) | `assets/description-ko.txt` | ✅ |
| 📝 Description (ZH-TW) | `assets/description-zh-tw.txt` | ✅ |
| 📝 Description (FR) | `assets/description-fr.txt` | ✅ |
| 📝 Description (DE) | `assets/description-de.txt` | ✅ |
| 📝 Description (ES) | `assets/description-es.txt` | ✅ |
| 📝 Description (PT-BR) | `assets/description-pt-br.txt` | ✅ |
| 📝 Description (RU) | `assets/description-ru.txt` | ✅ |
| 🔒 Privacy Policy | [`PRIVACY.md`](PRIVACY.md) | ✅ |
| 🖼️ Store Icon (128×128) | `src/icons/icon128.png` | ✅ |
| 🖼️ Promo Tile (440×280) | — | ⬜ Manual |
| 📸 Screenshots (1280×800) | — | ⬜ Manual |

### Steps

1. Register at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) ($5 one-time fee)
2. Run `bun run build` to generate the ZIP
3. Upload `dist/hooky-<version>.zip`
4. Fill in listing details using the descriptions in `assets/`
5. Set privacy policy URL to `https://github.com/nocoo/hooky/blob/main/PRIVACY.md`
6. Upload promo tile (440×280) and at least 1 screenshot (1280×800 or 640×400)
7. Submit for review (typically 1–3 business days)

---

## 📄 License

[ISC](LICENSE)
