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

## 2026-10-04: Empty-state chrome survived the compact-layout pass

The previous pass kept the brand header and reserved feedback space even when
there were no templates or sending actions. Native sizing tests established that
the popup opened, but did not establish that each visible region served the
current task. The user correctly rejected the resulting oversized empty state.

Make loading, setup, recovery and sending explicit presentation states. Remove
decorative chrome from setup and recovery, hide empty docks, and keep one clear
next action. Extract the shared popup typography, spacing, control and status
tokens instead of patching individual font sizes. Test the absence of irrelevant
regions and the setup action in real action popups, not just overall dimensions.

The next review clarified that removing redundant chrome is not permission to
remove identity: the empty task has room for a small logo and name. The approved
implementation keeps a compact header, a scrollable content region and a footer
for the task action and result. Never confuse an empty reserved region with a
useful brand or action region; validate each independently.

## 2026-10-04: Mixed icon sources produced inconsistent interface glyphs

The popup work retained handwritten gear/link/lightning paths and combined
unrelated feedback paths into shared SVGs. Stroke widths differed across
surfaces. A partial Lucide adoption was not a coherent icon system, and the user
rejected the visual result. Copy complete upstream SVGs, preserve their geometry
and 2px stroke, and switch whole SVGs for state changes. Keep exact upstream
fixtures and compare shipped markup to them so later edits cannot silently
deform icons. Historical design archives remain unchanged.

## 2026-10-04: Retained feedback looked like a result for a new capture

The popup read and rendered the last session result on every opening, so a new
page showed an earlier HTTP 201 before any request was made. Separate opening a
capture from explicitly inspecting a result. The normal route does not read or
subscribe to historical result display; its own send response populates the
footer. The `?view=last` route keeps the existing session result and update flow
for view-result menu items, notifications and page feedback. Keep session data
intact and test both routes; hiding history is not permission to delete it.

## 2026-10-04: Root font tokens did not override Chrome's body style

Typography changes were checked on buttons and selected explicit labels, but
not on inherited form values. The user reported mismatched labels and inputs.
The real extension showed 12px labels beside 9.75px inputs: Chrome injects
`body { font-size: 75% }`, shrinking the previous 13px root size. Setting the
root to 12px alone still produced a 9px body, disproving the initial suspicion
that the font shorthand itself caused the mismatch. CDP matched-style evidence
identified the injected rule, and an explicit body declaration restored 12px.

Use shared 10/12/14px tokens and explicitly size the extension body. Apply the
same scale inside isolated page-feedback styles. Inspect computed typography
across all text and form controls, including hidden panels, themes and native
popup windows. Checking a few button sizes or CSS declarations cannot establish
a consistent typography system.
