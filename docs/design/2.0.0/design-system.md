# Family design notes

Hooky: wisteria; light accent #7851a5, dark accent #c8a6f0.
R2Shot: sea glass; light action #177c70, dark action #78cbbb.

Both products use a 360px toolbar popup, a compact options workspace, a 220px desktop sidebar, 34px controls, small radii, fine borders, and restrained shadows. Shared layout grammar is expressed in small native CSS files rather than a shared runtime dependency. Each extension remains independently installable and uses its existing storage keys.

Extension runtime fonts are system fonts. The marketing material uses the existing Space Grotesk and Geist Mono assets from the hexly.ai brand archive, under their included OFL licenses. The parent brand appears as small text. Original logos and icons are never regenerated, recolored, or replaced.

The campaign borrows the brand site's editorial grid and launch-template hierarchy. Azure-generated matte paper and frosted-glass scenery is decorative only. All UI shown in store images is captured from tested extension code using synthetic configuration; text and logos are composited with HTML/CSS.

The standalone preview embeds the shipped interface modules, styles, and original icon bytes. A local Chrome API adapter supplies demo storage and page context, and simulates network/capture responses. Its frame margins are adjusted for presentation. The preview is not included in either extension ZIP.

Runtime CSP keeps scripts local. No framework, remote font, image-generation client, marketing image, or preview adapter is shipped in either extension. Full-page capture is bounded and releases intermediate bitmaps. Native Web Crypto signing is compared against the development-only AWS SDK.

Chrome Web Store sizes: screenshots 1280×800 (640×400 is also accepted), 1–5; small promo 440×280, one; optional marquee 1400×560, one; icon 128×128. Three alternatives are provided for each promo slot.
Official image reference: https://developer.chrome.com/docs/webstore/images
Hooky API compatibility: https://developer.chrome.com/docs/extensions/reference/api/action#method-openPopup
