const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {root, slug, version, source, output, executablePath} = require('./paths.cjs');
const puppeteer = require('puppeteer');
const copy = {[slug]: require(path.join(source, 'copy.json'))};
const products = {[slug]: require(path.join(source, 'artwork.json'))};

const escape = (text) => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const common = `
@font-face{font-family:Space;src:url('../brand/space-grotesk.woff2') format('woff2');font-style:normal;font-weight:300 700;font-display:block}
@font-face{font-family:Mono;src:url('../brand/geist-mono.woff2') format('woff2');font-style:normal;font-weight:100 900;font-display:block}
*{box-sizing:border-box}body{margin:0;font-family:Space,Arial,sans-serif;color:var(--ink);font-synthesis:none}main{position:relative;isolation:isolate;width:100vw;height:100vh;overflow:hidden;background:var(--page)}
.background{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-3}.veil{position:absolute;inset:0;z-index:-2;background:linear-gradient(90deg,var(--page) 0%,transparent 88%);opacity:.52}
.brand{display:flex;align-items:center;gap:12px;position:absolute;left:62px;top:38px}.brand img{width:52px;height:52px;object-fit:contain}.brand strong{display:block;font-size:25px;font-weight:600;letter-spacing:-1px}.brand small{display:block;font-size:12px;color:var(--muted);margin-top:3px}.edition{position:absolute;right:62px;top:54px;font:11px Mono,monospace;letter-spacing:1px;color:var(--muted)}
h1,h2,p{margin:0}h1{font-weight:500;letter-spacing:-.055em;line-height:1.04}.headline{position:absolute;left:68px;top:205px;width:600px}.headline h1{font-size:70px}.lede{font-size:22px;line-height:1.6;color:var(--muted);margin-top:25px}.feature{font:12px Mono,monospace;letter-spacing:.2px;color:var(--accent);margin-top:38px;display:flex;align-items:center;gap:10px}.feature:before{content:'';width:6px;height:6px;border-radius:50%;background:var(--accent)}
.signature{position:absolute;left:68px;bottom:42px;font-size:13px;color:var(--muted)}.signature b{font-weight:500;color:var(--ink)}.frame{overflow:hidden;border-radius:14px;box-shadow:0 2px 5px #22201f08,0 26px 70px #3030381a;border:1px solid #ffffffaa;background:#fff}.frame img{display:block;width:100%;height:auto}.popup{position:absolute;left:794px;top:146px;width:390px;border-radius:16px;box-shadow:0 3px 6px #2820300a,0 28px 90px #3930422b}.content{position:absolute;left:566px;top:298px;width:430px;transform:rotate(-5deg);border:10px solid #fff}.content:before{content:'FIELD NOTES / A CALMER WORKFLOW';display:block;font:8px Mono,monospace;letter-spacing:.5px;padding:4px 5px 11px;color:#62756a}
.workspace .brand{top:27px}.workspace .edition{display:none}.workspace-title{position:absolute;top:35px;left:393px;right:56px}.workspace-title h1{font-size:35px;letter-spacing:-1.6px;line-height:1.16}.workspace-title p{font-size:15px;color:var(--muted);margin-top:9px}.workspace .workspace-frame{position:absolute;width:1000px;left:140px;top:126px}.workspace .signature{display:none}
.dark{color:var(--ink);--ink:#f2edf7;--muted:#c1b5ce;--page:#292131;--accent:#cfb6ec}.dark .background{opacity:.12}.dark .veil{opacity:.5}.dark .frame{border-color:#4d3e60;box-shadow:0 24px 80px #0d081d4d}.dark .workspace-frame{top:150px}.dark .workspace-title{top:48px}.dark .brand{top:39px}
.full .headline{width:415px;top:223px}.full .headline h1{font-size:57px}.full .lede{font-size:20px}.full .feature{font-size:11px}.full-page{position:absolute;left:506px;top:139px;width:314px;transform:rotate(-2deg)}.full-label{position:absolute;left:506px;top:112px;font:10px Mono,monospace;color:var(--muted);letter-spacing:.7px}.full .popup{left:854px;top:161px;width:360px}.full .edition{display:none}
.banner .brand{left:26px;top:22px;gap:8px}.banner .brand img{width:38px;height:38px}.banner .brand strong{font-size:20px;letter-spacing:-.7px}.banner .brand small{display:none}.banner .edition{top:31px;right:27px;font-size:9px;letter-spacing:.3px}.banner .headline{left:28px;top:91px;width:370px}.banner .headline h1{font-size:36px;letter-spacing:-1.75px;line-height:1.05}.banner .feature{font-size:9px;margin-top:20px;gap:7px}.banner .feature:before{width:4px;height:4px}.banner .signature{left:28px;bottom:22px;font-size:10px}.banner .background{object-position:80% center}.banner .veil{opacity:.8;background:linear-gradient(90deg,var(--page) 0%,transparent 100%)}.banner.variant-2 .background{transform:scale(1.16);transform-origin:right bottom}.banner.variant-3 .background{transform:scale(1.36);transform-origin:85% 80%}
.marquee .brand{left:66px;top:35px}.marquee .brand img{width:44px;height:44px}.marquee .brand strong{font-size:23px}.marquee .brand small{font-size:11px}.marquee .headline{left:70px;top:161px;width:710px}.marquee .headline h1{font-size:65px}.marquee .lede{font-size:20px;line-height:1.5;margin-top:19px}.marquee .feature{margin-top:25px;font-size:11px}.marquee .popup{left:1010px;top:44px;width:306px}.marquee .content{left:802px;top:235px;width:335px}.marquee .signature{bottom:31px;left:70px;font-size:12px}.marquee .edition{display:none}
`;

function brand(slug, hasSignature = false) {
  return `<div class="brand"><img src="../brand/${slug}-logo.png" alt="${copy[slug].name} logo"><div><strong>${copy[slug].name}</strong><small>${hasSignature ? 'a product of hexly.ai' : 'A little less friction. A little more flow.'}</small></div></div>`;
}
function screenshot(slug, index) {
  const p = products[slug];
  if (index === 1 || (slug === 'hooky' && index === 2)) {
    const heading = slug === 'hooky' ? (index === 1 ? 'Make a template. Keep your flow.' : 'The right page. The right webhook.') : 'Your storage. Your settings.';
    const sub = slug === 'hooky' ? (index === 1 ? 'A request preview, page variables, and room for the details.' : 'Match a URL or title. Test it. Set its priority. Send on your click.') : 'Connect your R2 bucket. Choose the quality. Set your full-page limit.';
    return {
      className: `workspace${index === 2 ? ' dark' : ''}`,
      body: `${brand(slug, true)}<div class="workspace-title"><h1>${heading}</h1><p>${sub}</p></div><div class="frame workspace-frame"><img src="../captures/${p.ui[index]}.png" alt="${escape(heading)}"></div>`,
    };
  }
  const title = `<div class="headline"><h1>${p.titles[index]}</h1><p class="lede">${p.short[index]}</p><div class="feature">${p.features[index]}</div></div>`;
  return {
    className: index === 2 ? 'full' : 'hero',
    body: `${brand(slug, true)}<div class="edition">CHROME EXTENSION / ${version}</div>${title}${index === 2 ? '<div class="full-label">FULL-PAGE CAPTURE / LOADED CONTENT</div><div class="frame full-page"><img src="../captures/captured-full-page.jpg" alt="A captured full webpage"></div>' : '<div class="frame content"><img src="../captures/captured-visible.jpg" alt="The active browser page"></div>'}<div class="frame popup"><img src="../captures/${p.ui[index]}.png" alt="${copy[slug].name} ${index === 2 ? 'upload result in dark theme' : 'toolbar popup'}"></div><div class="signature">${index === 2 ? 'A full page, within the capture limit you choose.' : 'One browser. A few thoughtful tools.'}</div>`,
  };
}
function banner(slug, index, isMarquee = false) {
  const p = products[slug];
  return {
    className: `${isMarquee ? 'marquee' : 'banner'} variant-${index + 1}`,
    body: `${brand(slug)}<div class="edition">CHROME / ${version}</div><div class="headline"><h1>${isMarquee ? p.titles[index] : p.compact[index]}</h1>${isMarquee ? `<p class="lede">${p.short[index]}</p>` : ''}<div class="feature">${p.features[index]}</div></div>${isMarquee ? `<div class="frame content"><img src="../captures/captured-visible.jpg" alt="A browser page"></div><div class="frame popup"><img src="../captures/${slug === 'r2shot' && index === 2 ? p.ui[2] : p.ui[0]}.png" alt="${copy[slug].name} popup"></div>` : ''}<div class="signature">a product of <b>hexly.ai</b></div>`,
  };
}

(async () => {
  const layout = path.join(source, 'layouts');
  await fs.mkdir(layout, { recursive: true });
  const manifest = [];
  const browser = await puppeteer.launch({ executablePath: executablePath, headless: true, args: ['--lang=en-US'] });
  try {
    const page = await browser.newPage();
    for (const slug of Object.keys(products)) {
      const p = products[slug];
      for (const [kind, width, height] of [['screenshots', 1280, 800], ['banners', 440, 280], ['marquee', 1400, 560]]) {
        for (let index = 0; index < 3; index++) {
          const number = String(index + 1).padStart(2, '0');
          const name = `${slug}-${kind}-${number}-${width}x${height}`;
          const scene = kind === 'screenshots' ? screenshot(slug, index) : banner(slug, index, kind === 'marquee');
          const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>${copy[slug].name} — ${kind} ${number}</title><style>:root{--ink:${p.ink};--muted:${p.muted};--accent:${p.accent};--page:${p.page}}${common}</style><main class="${scene.className}"><img class="background" src="../images/${slug}-original.png" alt=""><div class="veil"></div>${scene.body}</main></html>`;
          const file = path.join(layout, name + '.html');
          await fs.writeFile(file, html);
          await page.setViewport({ width, height, deviceScaleFactor: 1 });
          await page.goto(pathToFileURL(file).href);
          await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
          const imageFile = `store/${kind}/${name}.png`;
          await page.screenshot({ path: path.join(output, imageFile), type: 'png', omitBackground: false });
          manifest.push({ product: slug, kind, variant: index + 1, file: imageFile, width, height, language: 'en', source: `../source/layouts/${name}.html`, description: p.titles[index].replace('<br>', ' ') });
          console.log('Rendered', imageFile);
        }
      }
      // Optimized, local-only background for the standalone landing page.
      await page.goto(pathToFileURL(path.join(layout, `${slug}-banners-01-440x280.html`)).href);
      const original = await fs.readFile(path.join(source, `images/${slug}-original.png`));
      const jpeg = await page.evaluate(async (data) => {
        const source = new Image();
        source.src = data;
        await source.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 1440; canvas.height = 960;
        canvas.getContext('2d').drawImage(source, 0, 0, 1440, 960);
        return canvas.toDataURL('image/jpeg', .88).split(',')[1];
      }, 'data:image/png;base64,' + original.toString('base64'));
      await fs.writeFile(path.join(source, `images/${slug}-web.jpg`), Buffer.from(jpeg, 'base64'));
    }
    await fs.writeFile(path.join(output, 'artwork-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
