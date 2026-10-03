# Hooky popup review / 2026-10-04

Open `index.html` directly in Chrome. This is an offline visual review, not an
extension implementation. All strings, destinations, credentials and results are
synthetic. The CSP forbids network connections and form submission. No Chrome
extension APIs or storage are used.

## Scope

Twelve popup scenarios compare a static reconstruction of committed revision
`7a0dfbe` against a new proposal: setup, ready, pending, HTTP success, accepted,
authorization failure, unconfirmed, duplicate warning, receipt, long capture,
invalid destination and initialization failure. Baseline CSS is copied from that
revision. Baseline HTML has local asset and simulation script references; this
is not evidence of native popup behavior or the current uncommitted worktree.

The proposal retains the logo and name within the task's content, including the
empty state. There is no standalone decorative header or empty footer. It uses
12px working text, 16px identity/task headings, 11px technical metadata and an
explicit 4/8/12/16/24px spacing scale. It keeps the existing Wisteria direction;
amber separates uncertainty from failure. Error actions and validation changes
are proposed behavior, pending review, not implemented runtime features.

## Interactions

- Switch dark/light themes and compare/proposal-only views.
- Jump between scenarios; all previews render at 380 CSS pixels, not scaled.
- Open request and receipt details, edit text or switch a template.
- Send simulates a 1.6-second wait and then a result; no HTTP request is made.
- Setup/retry/edit actions navigate a simulated state, never the real options.
- The baseline is for inspection; its action buttons explicitly identify it as
  a static reconstruction.

Native action sizing, Chrome permissions, real storage, HTTP behavior and user
acceptance remain outside this static design study. Existing runtime files,
the unpacked extension and historical design materials are left untouched.

## Check

From the repository root, using installed Puppeteer:

```sh
node docs/design/2026-10-04-popup-review/check.cjs
```

The check opens only local files in a temporary browser profile, verifies the
comparison, scenario interactions, fixed action visibility, themes and responsive
review shell, and writes screenshots under `verification/`. It does not build or
load the extension.

Icons inline only the selected paths already used by Hooky (Lucide revision
`500620a2e8123f8d1db191538886dc0c223f69a9`), with license in
`assets/LUCIDE-LICENSE`. Logos are existing Hooky assets, copied into this archive
to keep the review independent of later runtime changes.
