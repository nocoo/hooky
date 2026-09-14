# Hooky submission materials

Everything needed to produce Hooky's submission package lives in this repository. No sibling project, joint delivery directory, brand-site checkout, or image-generation API is needed to reproduce the approved artwork.

- [2.0.0 gallery](2.0.0/index.html)
- [2.0.0 interactive preview](2.0.0/preview.html)
- [2.0.0 standalone English website](2.0.0/site/index.html)
- [Manual testing guide](2.0.0/TESTING.md)
- [Earlier designs and the approved family HTML](../docs/design/README.md)

## Layout

```text
materials/
  source/
    copy.json           English listing, permissions, privacy handling, release copy
    artwork.json        Product palette and three campaign variants
    site.json           Landing-page sections and FAQ copy
    brand/              Unchanged logo, reference tokens, fonts and OFL licenses
    images/             Original Azure background and optimized web image
    captures/           Actual 2.0.0 UI captures, sample page, provenance and hashes
    prompts/            Original prompts and generation provenance
    layouts/            Reproducible HTML compositions for the store images
    gallery.css         Approved gallery styling
  <version>/
    index.html          Product gallery, download links and copy controls
    preview.html        Current packaged UI with local simulated Chrome APIs
    hooky-<version>.zip  Extension runtime only
    unpacked/           Exact local extraction; generated and ignored by Git
    site/               Standalone English HTML to upload
    store/              3 screenshots, 3 banners, 3 marquees, icon and English text
    verification/       Current build/test logs and original review evidence
    UPLOAD.md           Store fields, sizes and upload order
    TESTING.md          Manual acceptance steps
    SHA256SUMS.txt
scripts/materials/      Repository-local build, composition and validation scripts
```

## Generate from this repository

Requires Bun, Node.js, Python 3, Bash/zip and Chrome. Puppeteer is a development dependency only. Install the repository dependencies with `bun install --frozen-lockfile`, then run:

```sh
bun run materials
```

This runs unit tests with the existing coverage gates, lint, repository E2E/workflow tests, and a production build; extracts the ZIP and tests it in Chrome; writes the English copy; builds the interactive UI preview; renders the 9 store images; creates the standalone website and gallery; and checks the HTML and assets in Chrome. It never commits, pushes, publishes, or submits to a store.

On macOS it uses the installed Google Chrome. Elsewhere, set `PUPPETEER_EXECUTABLE_PATH` to your Chrome executable, or use Puppeteer's installed browser. To recheck materials without rebuilding:

```sh
bun run materials:check
```

ZIPs are checked in for direct download. `unpacked/` is reproducible and excluded from Git. If a new build has identical file contents, the existing ZIP is retained so its approved checksum stays stable.

## Updating a later version

Keep the manifest and `package.json` versions synchronized. Edit `source/copy.json` (including its version), `artwork.json` and `site.json` for the new release. Update the UI images and `captures/provenance.json` when the interface changes; those images must depict the tested version and use synthetic configuration. The generator refuses a different copy/capture version so it cannot silently relabel an old campaign as a new release. Preserve the dated references in `docs/design/`.

Original decorative images and prompts are retained; only a new art direction needs the Azure image-generation skill. Original logos are never regenerated or recolored. Fonts retain their included SIL Open Font License notices.

`verification/build.json` binds the current tests to the package checksum and runtime-file hashes. `approved-family-*` files preserve the original joint review and are historical records. HTML preview requests are simulated. Real webhook endpoints, Chrome clipboard behavior, and a live R2 bucket/CDN are covered by manual acceptance with the installed extension. The gallery marks manual acceptance as pending until it is recorded.

Store requirements: screenshots 1280×800 (3 ordered uploads); small promos 440×280 (3 alternatives for one slot); optional marquees 1400×560 (3 alternatives for one slot). All supplied images are opaque RGB PNGs. Use variant 01 for a general-purpose promo.
