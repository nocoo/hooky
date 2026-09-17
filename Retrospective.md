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
