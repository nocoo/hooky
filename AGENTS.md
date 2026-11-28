# Hooky

Chrome Manifest V3 extension (Chrome 127+, vanilla JS/HTML/CSS, no transpiler or backend) for configuring and sending webhook templates from popup, context menu, and Quick Send.
Docs: [README.md](README.md) · [Extension contract](docs/01-extension-contract.md) · [TESTING.md](TESTING.md) · [PRIVACY.md](PRIVACY.md) · [Materials](materials/README.md) · [Retrospective](Retrospective.md)

## Commands

Run from root with Bun/Node (versions in `.github/workflows/quality-slots.yml`; Biome, Vitest/jsdom, Puppeteer). Layout: `src/` services, `src/popup/`, `src/options/`, `_locales/`, `materials/`. For dev, load unpacked at `chrome://extensions/` and reload after edits.

```sh
bun install --frozen-lockfile
bun run typecheck          # S1: tsc --noEmit (checkJs across src/**/*.js)
bun run lint               # S2: check-only, 0 warnings
bun run test:coverage      # L1: Vitest v8 >= 90/85% (st/fn/ln 90%, br 85%), no .only/.skip
bun run test:l1-gate       # Pre-commit index-snapshot probes (disposable repos)
bun run build              # B1: dist/hooky-<version>.zip (no store publish)
bunx puppeteer browsers install chrome
bun run test:e2e           # L4: Puppeteer + local receiver (Chrome 137+ for dev install API)
bun run materials:check    # Validate generated submission materials
```

Set `PUPPETEER_EXECUTABLE_PATH` only to select an installed Chrome. `bun run materials` (Python) generates versioned campaign artifacts; run it for material changes, not normal tests.

## Invariants

- `manifest.json` (`version`) is authoritative; keep `package.json` synchronized and display runtime `chrome.runtime.getManifest().version`.
- Package uses ESM (`"type": "module"`) across `src/**/*.js` and `tests/**/*.test.js`, with CommonJS Puppeteer E2E runners in `tests/e2e/*.cjs`; `scripts/build.sh` packages only runtime files into `dist/hooky-<version>.zip` without publishing.
- Persist templates under `chrome.storage.local` key `hooky`; optional fields preserve legacy HTTP behavior. Exact fields, caps, and lifetimes live in [extension contract](docs/01-extension-contract.md).
- Resolve each logical send once; header and body bindings share one UUID. Edited or pasted captured variable syntax stays literal. Never claim automatic retry or server-side idempotency.
- GET/DELETE use query parameters; POST/PUT/PATCH use JSON. Custom-header requests reject redirects and stay masked. Keep the 20s header timeout and opt-in receipt limits of 8 KiB / 3s.
- Session storage holds summaries and fingerprints only, never raw bodies or credentials. Explicit repeat captures live in worker memory for at most 60s and disappear on restart.
- Extract page context only on demand via `chrome.scripting.executeScript` / `activeTab`; keep restricted-page fallbacks. Only the extension's own popup can send or inspect captures.
- Preserve Chrome i18n's ten locales and placeholders, wisteria theme/native CSS variables, compact controls, and Quick Send icon behavior (`default_popup` controls `onClicked`).
- Hooky owns its versioned [materials](materials/README.md); keep originals, source prompts, and historical designs. Never label manual acceptance or live CDN behavior verified without evidence.
- Authorized releases sync manifest/package versions and `CHANGELOG.md`, verify, build ZIP, tag/GitHub Release, and upload manually to Chrome Web Store ([release](docs/01-extension-contract.md)).
- Install DOM fixtures before importing top-level popup/options modules (`vi.resetModules()`); keep `editorMode` as `"rule"` after rule deletion; E2E receiver must answer CORS `OPTIONS`.

## Quality & Local Gates

Follows `system1-quality`; CI runs `.github/workflows/pipeline.yml` -> `.github/workflows/quality-slots.yml` with pinned `base-ci` (`v2026.24`) actions (`quality / Z1: Gate` required on `main`, checking all `enforced` slots and tested-SHA match), with no automated CD workflow (manual ZIP / Chrome Web Store release only). Status vocabulary: `enforced`, `planned`, `manual`, `N/A`.

- **Floors**: Vitest v8 (`vitest.config.js`) enforces `>= 90%` statements/functions/lines and `>= 85%` branches and rejects `.only`/`.skip`/empty suites; Biome runs `biome check --error-on-warnings`; TypeScript runs `tsc --noEmit` (`allowJs: true`, `checkJs: true`, `strict: false`, `@types/chrome`).
- **N/A slots**: `P1 Package` (extension ZIP, not npm).
- **N/A runtime/service**: `L2 Runtime` (Chrome MV3 extension); `L3 Integration` (no standalone HTTP service; E2E runs in `L4` via Puppeteer local receiver).
- **Manual checks**: Chrome Web Store submission/approval, live CDN/R2 behavior, and real-toolbar/OS acceptance remain `manual` ([TESTING.md](TESTING.md)).
- **Local `pre-commit`** (`.husky/`, via `bun run prepare`; never bypass): snapshots staged index (`git checkout-index --all`), symlinks `node_modules` (`.cache/`), honors `HOOKY_L1_TIMEOUT_SEC`.
- **Pre-commit guards**: fails on missing `git`/`bun`/`node_modules`, staged/worktree `package.json`/`bun.lock` mismatch, missing `--coverage`/`coverage/`, or `typecheck` (when `tsconfig.json` is present) / `test:coverage` / `lint` failure.
- **Gate probes**: `bun run test:l1-gate` verifies local pre-commit pass/reject in disposable repos (UT, coverage, lint warnings, focus/skip/empty, staged isolation, timeout/SIGINT, missing `bun`).
- **Pre-push & gaps**: `.husky/pre-push` runs `bun run build && bun run test && bun run lint` on the working tree; stdin-ref `pre-push` + `G2` (<3min, missing scanners fail) and <30s `pre-commit` are `planned`.

## Resources & Isolation

- Puppeteer E2E uses a temporary extension copy/profile and local webhook receiver; use synthetic templates/credentials and isolated storage, and never send test captures to a live user webhook.
- Keep the statically imported E2E worker driver out of production packages (MV3 service workers cannot use dynamic imports). No backend server, Cloudflare resources, or production database apply.

## Retrospective

Record incident narratives in [Retrospective.md](Retrospective.md); promote recurring project constraints to `Invariants` above and enforceable safeguards to tests or hooks.
