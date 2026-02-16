# Hooky

A Chrome Extension for configuring and triggering webhook templates from your browser toolbar, context menu, or via Quick Send mode.

## Features

- **Multiple webhook templates** — create, edit, and manage named webhook templates with URL, HTTP method, and key-value parameters
- **Template variables** — use `{{page.url}}`, `{{page.title}}`, `{{page.selection}}`, `{{page.meta.description}}`, `{{page.meta.og:title}}`, `{{page.meta.og:description}}`, `{{page.meta.og:image}}` in parameter values
- **Context menu** — right-click to trigger any template from the "Hooky" menu
- **Quick Send mode** — click the toolbar icon to instantly fire a designated template (badge flashes success/failure)
- **Theme switching** — system, light, or dark theme
- **i18n** — English and Chinese (Simplified) via `chrome.i18n`

## Development Setup

### Prerequisites

- [Bun](https://bun.sh/) (v1.x or later)
- Chrome (for loading the extension and E2E tests)

### Install dependencies

```sh
bun install
```

This also runs `husky` via the `prepare` script to set up Git hooks.

### Load the extension in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the project root directory

### Available scripts

| Command | Description |
|---|---|
| `bun run test` | Run unit tests (Vitest) |
| `bun run test:watch` | Run unit tests in watch mode |
| `bun run test:coverage` | Run unit tests with V8 coverage (90% threshold for statements, branches, functions, and lines) |
| `bun run lint` | Lint `src/` and `tests/` with ESLint |
| `bun run test:e2e` | Run Puppeteer E2E tests |

### Git hooks (Husky)

Hooks are checked in under `.husky/` and shared across the team.

| Hook | Runs |
|---|---|
| `pre-commit` | `bun run test` |
| `pre-push` | `bun run test && bun run lint` |

### Project structure

```
hooky/
├── _locales/           # i18n message files (en, zh_CN)
├── .husky/             # Git hooks (pre-commit, pre-push)
├── scripts/            # Utility scripts (icon generation)
├── src/
│   ├── background.js   # Service worker (startup, message routing)
│   ├── content.js      # Content script (page context extraction)
│   ├── contextmenu.js  # Context menu setup and handling
│   ├── i18n.js         # i18n helpers (applyI18n, t)
│   ├── icons/          # Extension icons (16–256px)
│   ├── options/        # Settings page (HTML, CSS, JS)
│   ├── params.js       # Request body/URL builder
│   ├── popup/          # Toolbar popup (HTML, CSS, JS)
│   ├── quicksend.js    # Quick Send logic with badge feedback
│   ├── store.js        # Storage CRUD, migration, settings
│   ├── template.js     # Template variable resolution
│   ├── theme.js        # Theme switching (system/light/dark)
│   └── webhook.js      # HTTP request executor
├── tests/
│   ├── *.test.js       # Unit tests (Vitest + jsdom)
│   └── e2e/            # Puppeteer E2E tests
├── manifest.json       # Chrome Extension Manifest V3
├── vitest.config.js    # Vitest + coverage config
├── eslint.config.mjs   # ESLint flat config
└── package.json        # Scripts and dev dependencies
```

## License

ISC
