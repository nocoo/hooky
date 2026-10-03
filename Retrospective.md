# Retrospective

Accident narratives and original lessons. Historical instructions below describe their time; the current handbook and its local-isolation contract take precedence.

## Undated entries migrated from CLAUDE.md

- **German locale Unicode quotes**: `„"` curly quotes break JSON parsing. Use `«»` instead.
- **Test runner**: tests are run via `vitest run` (or `npm test`). The project no longer uses bun's built-in test runner.
- **V8 coverage branch counting**: `||`, `?.`, and `&&` operators each count as branches. Defensive fallbacks like `x || ''` create uncoverable branches when x is always truthy in tests.
- **Content script limitations**: `chrome.scripting.executeScript` with `activeTab` is more reliable than persistent content_scripts, and avoids needing host permissions.
- **Top-level DOM access**: Modules that call `document.getElementById()` at import time require DOM fixtures before `import()` in tests.
- **ESM exports in src/**: All source files must use ESM `export` syntax (not `module.exports`) since ESLint config sets `sourceType: "module"` for `src/**/*.js`.
- **deleteCurrentRule editorMode**: After deleting a rule, keep `editorMode` as `"rule"` (not `null`) so `renderAll()` stays in rule context and shows empty state or selects next rule. Setting it to `null` causes `renderAll()` to fall through to template selection.
- **E2E CORS preflight**: Chrome extension popup sends CORS preflight (OPTIONS) for cross-origin POST requests. The E2E webhook server must handle OPTIONS with proper CORS headers, otherwise the actual POST never completes.

## 2026-10-04: Popup feedback assertion lagged behind the UI change

The compact popup intentionally replaced duplicate success toasts with a single
persistent result. The first browser run still asserted that the old toast was
visible, although the unit suite passed. Update browser assertions alongside
changes to the presentation contract: assert both that the result is visible and
that a second notification is absent. Add viewport-bound checks for pending,
success, failure, long captures and expanded details rather than relying on DOM
presence as evidence that the primary action remains on screen.

## 2026-10-04: Viewport-relative bounds collapsed the native action popup

The popup polish added `max-width: 100vw` to its fixed-width body and capped the
container at `100dvh`. Chrome starts an action popup with a 25 x 25 viewport and
then sizes it from its content. Both bounds therefore clamped the content to the
initial viewport, preventing the native window from growing. The user received
an unusable sliver despite passing layout checks in ordinary tabs whose viewport
had already been assigned. The delivered unpacked package contained this bug.

Remove viewport-dependent root bounds: use a 380px width and 480px content-height
cap, allowing Chrome to determine the initial popup size. The former 540px cap
also exceeded the 498px available in the test browser's 600px window. Replace the artificial
narrow-tab assumption with native action-popup tests through the production
`OPEN_PANEL` handler, with no viewport emulation. Cover empty configuration,
ordinary and long captures, pending sends, completed results and expanding
details. A tab-rendered screenshot cannot prove extension popup sizing.
