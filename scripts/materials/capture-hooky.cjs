const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const puppeteer = require('puppeteer');
const {version, source, output, executablePath} = require('./paths.cjs');
const demo = require(path.join(source, 'demo.json'));

// Capture the installed package's real UI. All configuration and receipt data are fixtures.
(async () => {
  const browser = await puppeteer.launch({executablePath, headless:true, pipe:true, enableExtensions:true, args:['--enable-unsafe-extension-debugging', '--lang=en-US', '--no-first-run']});
  const errors = [];
  const captures = path.join(source, 'captures');
  try {
    const extensionId = await browser.installExtension(path.join(output, 'unpacked'));
    const base = `chrome-extension://${extensionId}/`;
    const options = await browser.newPage();
    options.on('pageerror', error => errors.push(error.message));
    await options.setViewport({width:1120, height:780, deviceScaleFactor:1});
    await options.goto(base + 'src/options/options.html');
    assert.equal(await options.evaluate(() => chrome.runtime.getManifest().version), version);
    await options.evaluate(async store => { await chrome.storage.local.set({hooky:store}); await chrome.storage.session.clear(); }, demo.store);
    await options.reload();
    await options.waitForFunction(() => document.getElementById('template-name').value === 'Knowledge inbox');
    assert(await options.$eval('#request-preview', element => element.textContent.includes('authorization: ••••') && !element.textContent.includes('EXAMPLE_TOKEN')));
    await options.screenshot({path:path.join(captures, 'hooky-settings-light.png')});

    await options.evaluate(async () => { const {hooky} = await chrome.storage.local.get('hooky'); await chrome.storage.local.set({hooky:{...hooky, theme:'dark'}}); });
    await options.reload();
    await options.click('[data-panel="panel-rules"]');
    await options.click('#rules-list [data-id="notes"]');
    await options.waitForFunction(() => getComputedStyle(document.getElementById('rule-editor-form')).display !== 'none' && document.documentElement.dataset.theme === 'dark');
    await options.type('#rule-sample', demo.context.page.url);
    await options.click('#test-rule');
    await options.screenshot({path:path.join(captures, 'hooky-rules-dark.png')});
    await options.evaluate(async () => { const {hooky} = await chrome.storage.local.get('hooky'); await chrome.storage.local.set({hooky:{...hooky, theme:'light'}}); });

    const article = await browser.newPage();
    await article.setRequestInterception(true);
    article.on('request', request => request.respond({status:200, contentType:'text/html', body:'<!doctype html><title>Designing a calmer workflow</title><p id="selection">Good tools give your attention back.</p>'}));
    await article.goto(demo.context.page.url);
    await article.evaluate(() => { const range = document.createRange(); range.selectNodeContents(document.getElementById('selection')); getSelection().removeAllRanges(); getSelection().addRange(range); });
    await article.bringToFront();
    const popupUrl = base + 'src/popup/popup.html';
    await options.evaluate(url => chrome.tabs.create({url, active:false}), popupUrl);
    const popup = await (await browser.waitForTarget(target => target.url() === popupUrl)).page();
    popup.on('pageerror', error => errors.push(error.message));
    await popup.setViewport({width:360, height:700, deviceScaleFactor:1});
    await popup.waitForSelector('#params-preview textarea');
    await popup.waitForFunction(() => document.getElementById('page-title').textContent === 'Designing a calmer workflow', {polling:100});
    // Read the active article first, then foreground the extension tab for screenshots and clicks.
    await popup.bringToFront();
    assert(await popup.$eval('#params-preview', element => [...element.querySelectorAll('textarea')].some(field => field.value === 'Good tools give your attention back.')));
    await popup.screenshot({path:path.join(captures, 'hooky-popup-light.png'), fullPage:true});

    await popup.evaluate(async ({receipt}) => {
      const time = Date.UTC(2026, 8, 16, 4, 0, 0);
      await chrome.storage.session.set({hookyLastResult:{id:'21453039-1c57-4b75-8957-0d12e33917bc', templateId:'reading', name:'Knowledge inbox', tabId:null, source:'popup', state:'success', ok:true, status:201, httpOk:true, business:'matched', startedAt:time, finishedAt:time, receipt:{text:JSON.stringify(receipt), format:'json', message:receipt.message, receiptId:receipt.id}}});
    }, demo);
    await popup.waitForFunction(() => !document.getElementById('last-result').hidden);
    await popup.click('#last-response > summary');
    await (await popup.$('#last-result')).screenshot({path:path.join(captures, 'hooky-result-light.png')});
    assert.deepEqual(errors, []);

    const names = ['hooky-settings-light.png', 'hooky-popup-light.png', 'hooky-rules-dark.png', 'hooky-result-light.png'];
    const hashes = {};
    for (const name of names) hashes[name] = createHash('sha256').update(await fs.readFile(path.join(captures, name))).digest('hex');
    const record = {
      version, browser:await browser.version(),
      package_sha256:createHash('sha256').update(await fs.readFile(path.join(output, `hooky-${version}.zip`))).digest('hex'),
      source:'Actual installed ZIP in isolated Chrome. Synthetic templates, intercepted sample page, and a seeded receipt fixture; these screenshots are not evidence of a live receiver or OS notification.',
      script:'scripts/materials/capture-hooky.cjs', files:hashes,
      retained_sample_images:'captured-visible.jpg and captured-full-page.jpg are unchanged decorative sample-page captures from the original campaign.',
      console_errors:errors,
    };
    await fs.writeFile(path.join(captures, 'provenance.json'), JSON.stringify(record, null, 2) + '\n');
    await fs.writeFile(path.join(output, 'verification/ui-captures.json'), JSON.stringify(record, null, 2) + '\n');
    console.log('Captured 4 UI images from Hooky ' + version + ' in ' + record.browser);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
