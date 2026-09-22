# Hooky

Chrome Manifest V3 extension for configuring and sending webhook templates from popup, context menu and Quick Send.
Profile: ts-worker-web (browser extension with JavaScript; no application server).
Direction: [extension contract](docs/01-extension-contract.md), [TESTING.md](TESTING.md).

## Sources of Truth

This handbook is the contract; hooks, CI and config enforce it. Raise weaker enforcement to the contract, never lower requirements. Frameworks must not replace this file.

| Fact | Where |
| --- | --- |
| Human docs | [README.md](README.md), [PRIVACY.md](PRIVACY.md), [TESTING.md](TESTING.md) |
| Version | `manifest.json`; synchronize `package.json`, display runtime manifest version |
| Enforcement | `.husky/`, `.github/workflows/ci.yml`, `vitest.config.js` |
| Detailed behavior/release | [extension contract](docs/01-extension-contract.md) |
| Accidents | [Retrospective.md](Retrospective.md) |

## Project Invariants

- Persist templates under `chrome.storage.local` key `hooky`; optional advanced fields preserve old HTTP behavior. The [storage/response contract](docs/01-extension-contract.md) defines exact fields, caps and lifetimes.
- Resolve each logical send once; header/body bindings share one UUID. Edited/pasted captured variable syntax stays literal. Never claim automatic retry or server-side idempotency.
- GET/DELETE use query parameters; POST/PUT/PATCH use JSON. Custom-header requests reject redirects; headers remain masked. Keep 20-second header timeout and opt-in receipt limits of 8 KiB / 3 seconds.
- Session storage contains summaries/fingerprints, never raw bodies or credentials. Explicit repeat captures live in worker memory for at most 60 seconds and disappear on restart.
- Extract context only on demand via `chrome.scripting.executeScript`/`activeTab`; retain restricted-page fallbacks. Only the extension's own popup can send or inspect captures.
- Preserve Chrome i18n's ten locales and placeholders, wisteria theme/native CSS variables, compact controls and Quick Send icon behavior (`default_popup` controls `onClicked`).
- Each product owns its versioned materials. Keep originals, source prompts and historical designs; do not label manual acceptance or live CDN behavior verified without evidence.

## Stack / Layout

| Component | Choice |
| --- | --- |
| Runtime | Chrome 127+ MV3; vanilla JavaScript/HTML/CSS |
| Tooling | Bun; Node 24 for checks; ESLint 10 flat config, Vitest/jsdom |
| Browser tests | Puppeteer and a local webhook receiver; development install API needs Chrome 137+ |
| Layout | `src/` services, `src/popup/`, `src/options/`, `_locales/`, `materials/` |

Package metadata is CommonJS; application `src/**/*.js` uses ESM exports. The extension has no transpiler or backend. Build packages the source ZIP.

## Commands

Run from root. Dev means load this repository unpacked at `chrome://extensions/` and reload after edits.

```sh
bun install --frozen-lockfile
bun run lint
bun run test:coverage
bun run build
bunx puppeteer browsers install chrome
bun run test:e2e
bun run materials:check
```

Set `PUPPETEER_EXECUTABLE_PATH` only when selecting an installed Chrome. `bun run materials` uses Python to produce versioned campaign artifacts; run it for material changes, not normal tests. Build writes `dist/hooky-<version>.zip` and does not publish to the store.

## Verification

6DQ = L1/L2/L3 + G1/G2 + D1. Status: `enforced`, `planned`, `manual`, `N/A`. L1 statements/branches/functions/lines each ≥95%. Vitest rejects focused tests, skipped or todo tests, and empty runs.

| Piece | Requirement and current reality | Status | Evidence |
| --- | --- | --- | --- |
| L1 | Core, UI and extension source at four-metric 95% | enforced | Vitest config; pre-commit and CI coverage |
| L2 | Real extension-to-HTTP protocol/method combinations | planned | Puppeteer local receiver covers flows; full method/error matrix is not a gate |
| L3 | Popup/options/context-menu/Quick Send journeys | manual | `test:e2e`, [acceptance checklist](TESTING.md); absent from hooks/CI |
| G1 | JavaScript ESLint, zero errors/warnings | enforced | `lint` and hooks/CI; TypeScript lane N/A because source is JS |
| G2 | Required dependency and secret scanning | enforced | Shared quality CI runs OSV + gitleaks; local hooks omit security |
| D1 | Temporary browser profile, copied extension and loopback receiver | manual | Puppeteer runner; confirm each run targets its own fixtures |
| Package | Valid extension ZIP without test hooks | enforced | `scripts/build.sh`; pre-push and CI preparation |
| Materials | Versioned outputs and actual manual acceptance | manual | `materials:check`, TESTING.md |

Current pre-commit checks the Git index snapshot with coverage and lint. Pre-push builds and checks tests and lint on the working tree. Native coverage floors remain 95% for statements, branches, functions, and lines. Target: check-only index-snapshot L1/G1 <30s and stdin-ref L2/G2 <3min; missing scanners must fail. Never bypass commit/branch-push hooks.

## Resources / Isolation

Puppeteer creates a temporary extension copy/profile and local webhook receiver. Keep its statically imported worker driver out of production packages; MV3 service workers cannot use dynamic imports. Use synthetic templates/credentials and isolated browser storage; never send test captures to a user's configured live webhook. No Cloudflare resources or production database apply.

## Operations / Release

Authorized release: synchronize manifest/package versions and CHANGELOG, verify, `bun run build`, then immutable version tag/GitHub Release and manual Chrome Web Store ZIP upload. Follow [release process](docs/01-extension-contract.md). Public-store and user acceptance remain manual observations; [materials](materials/README.md) owns generated deliverables.

## Retrospective

Keep full narratives in [Retrospective.md](Retrospective.md). Cross-project lessons belong in nmem/global rules; deterministic checks belong in hooks/tests.

- Install DOM fixtures before importing top-level popup/options modules; use `vi.resetModules()`.
- E2E receiver must answer CORS OPTIONS; keep `editorMode` in rule context after rule deletion.
