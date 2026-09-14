const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL, fileURLToPath} = require('node:url');
const puppeteer = require('puppeteer');
const {root, slug, version, output, executablePath} = require('./paths.cjs');

(async () => {
  const checks = [], errors = [], requests = [];
  const browser = await puppeteer.launch({executablePath, headless:true, args:['--lang=en-US']});
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  try {
    const art = JSON.parse(await fs.readFile(path.join(output, 'artwork-manifest.json'), 'utf8'));
    assert.equal(art.length, 9);
    for (const asset of art) {
      const png = await fs.readFile(path.join(output, asset.file));
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      assert.equal(png.readUInt32BE(16), asset.width);
      assert.equal(png.readUInt32BE(20), asset.height);
      assert.equal(png[24], 8);
      assert.equal(png[25], 2, 'Store PNG must be opaque RGB');
    }
    checks.push('All 9 store images have the required dimensions and opaque RGB format');
    const pages = [
      'materials/' + version + '/index.html',
      'materials/' + version + '/site/index.html',
      'materials/' + version + '/preview.html',
      'docs/design/2.0.0/preview.html',
      'docs/design/2.0.0/index.html',
      'docs/design/2026-09-14-concepts/index.html',
    ];
    for (const relative of pages) {
      const file = path.join(root, relative), url = pathToFileURL(file);
      await page.setViewport({width:1440, height:1000});
      await page.goto(url.href, {waitUntil:'load'});
      await page.evaluate(async () => { await document.fonts.ready; for (const img of document.images) img.loading = 'eager'; await Promise.all([...document.images].map(img => img.decode())); });
      const references = await page.$$eval('[href],[src]', els => els.flatMap(el => ['href','src'].map(attr => el.getAttribute(attr)).filter(Boolean)));
      for (const ref of references) {
        if (/^(?:https?:|data:|blob:|mailto:|#)/.test(ref)) continue;
        const local = new URL(ref, url);
        if (local.protocol === 'file:') assert((await fs.stat(fileURLToPath(local))).isFile(), relative + ': ' + ref);
      }
      for (const width of [1440, 390]) {
        await page.setViewport({width, height:1000});
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), relative + ': overflow at ' + width);
      }
      checks.push(relative + ': local links, offline resources and responsive layout');
    }
    await page.goto(pathToFileURL(path.join(output, 'site/index.html')).href);
    await page.click('#alternate');
    assert(await page.$eval('[data-alt]', el => getComputedStyle(el).display !== 'none'));
    assert.equal(await page.$eval('[data-main]', el => getComputedStyle(el).display), 'none');
    await page.click('.faq summary');
    assert(await page.$eval('.faq details', el => el.open));
    checks.push('Landing-page native view switch and FAQ work');
    await page.goto(pathToFileURL(path.join(output, 'index.html')).href);
    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', {value:{writeText:async value => { window.copiedText = value; }}, configurable:true}); });
    await page.click('.listing summary');
    await page.click('[data-copy]');
    assert(await page.evaluate(() => window.copiedText === document.getElementById('listing-copy').value));
    checks.push('Gallery copy action works with an isolated clipboard stub');
    await page.setViewport({width:1440, height:1000});
    await page.goto(pathToFileURL(path.join(output, 'preview.html')).href);
    await page.waitForFunction(slug => document.getElementById(slug + '-workspace')?.contentDocument?.querySelector('input'), {}, slug);
    assert.equal(await page.$$eval('.product', elements => elements.length), 1);
    await page.$eval('#demo-title', element => { element.value = 'A page from this repository'; });
    await page.$eval('#context-form', form => form.requestSubmit());
    await page.waitForFunction(slug => document.getElementById(slug + '-popup')?.contentDocument?.body.textContent.includes('A page from this repository'), {}, slug);
    await page.click('#reset');
    checks.push('Independent packaged-UI preview updates page context and resets');
    assert.deepEqual(errors, [], 'Console errors');
    assert.deepEqual(requests, [], 'Unexpected network requests');
    await fs.writeFile(path.join(output, 'verification/materials-checks.json'), JSON.stringify({version, browser:await browser.version(), checks, console_errors:errors, external_requests:requests}, null, 2) + '\n');
    console.log('PASS ' + checks.length + ' material/archive checks for ' + slug);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
