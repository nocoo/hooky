# Hooky 2.1.0 — Upload guide

1. Complete [manual acceptance](TESTING.md), then upload `hooky-2.1.0.zip` to the existing [Chrome Web Store listing](https://chromewebstore.google.com/detail/hooky/almccnkbhfhckimediabjimflnbfbeeo).
2. Use the English name, short description and full description in `store/text/`. Short description: 128/132 characters.
3. Upload the 3 screenshots in `store/screenshots/` in order 01–03: **1280 × 800**, opaque PNG.
4. Choose one small promo in `store/banners/`: **440 × 280**. Variant 01 is recommended; 02 and 03 are alternatives for the same slot.
5. Optionally choose one **1400 × 560** marquee. Retain the original 128 × 128 store icon; an unchanged copy is supplied.
6. Copy the single-purpose, permission, data-use and release-note text from `store/text/`. Verify the public GitHub privacy-policy URL points to this version before submission.
7. `site/index.html` is the English standalone promotional page. Its images, font and styles are embedded; upload the one file to a static host.

Image dimensions: https://developer.chrome.com/docs/webstore/images

Source: this repository's `materials/source/` and `scripts/materials/`. Regenerate with `bun run materials` from this repository. Original identities are preserved. Azure-generated scenery is decorative; the interface captures use synthetic configuration.
