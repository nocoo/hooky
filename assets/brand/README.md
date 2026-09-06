# Hooky logo assets

The original animal is retained byte-for-byte. This Refined pass adds a tidal hooks background, fine grain, and shallow contact shadows. No image model was called, and the animal was not cropped, moved, recolored, or redrawn.

## Asset roles

| Surface | Asset | Treatment |
| --- | --- | --- |
| README header | `assets/brand/icon-rounded.png` at 128 px | Selected presentation |
| Toolbar / extension manager | `src/icons/icon{16,32,48,96,128,256}.png` | Transparent original |
| Popup / options headers | `src/icons/icon{24,48}.png` at 24 CSS px | Transparent original, including 2x |
| Popup / options favicons | `src/icons/icon{32,64}.png` | Transparent original |
| Historical original | `assets/hooky-max.png` | Preserved byte-identical backup; root `logo.png` is canonical |

Root `logo.png` is the canonical 900 × 900 transparent source. `icon.png` and `icon-rounded.png` in this directory are separate square and rounded presentations at the same native dimensions. Small app and browser marks must keep their alpha and must not receive the presentation background, a drop shadow, or an extra CSS crop.

## Reproduce and verify

Run from the repository root:

```sh
bash scripts/generate-icons.sh
```

The background recipe, exact original, palette samples, every size, and frozen finishing layers are archived in `nocoo/hexly.ai` under `artwork/logo-family/hooky/2026-09-07-01/finishing/01`. 1024 and 2048 px exports are explicitly labeled upscales; they do not replace this native master. [source.json](source.json) records the source revision and all master SHA-256 values.

- [Individual logo review](https://hexly.ai/logos/hooky)
- [Local static study](https://index.dev.hexly.ai/artwork/logo-family/hooky/2026-09-07-01/review.html)
- [Shared logo usage SOP](https://github.com/nocoo/hexly.ai/blob/main/docs/07-logo-usage-sop.md)

Before/after deliberately shares the same foreground. Check the background presentation at large sizes and the transparent foreground at 24/16 px on both light and dark. A source push does not submit a Chrome Web Store release or create a version tag.
