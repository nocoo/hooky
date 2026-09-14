/* Browser interaction check. Uses Hooky's existing development-only Puppeteer. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');
const moduleValue = require('puppeteer');
const puppeteer = moduleValue.default || moduleValue;

(async () => {
  const browser = await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),headless:true,args:['--disable-background-networking','--no-first-run']});
  const page = await browser.newPage();
  const errors = [], requests = [], passed = [];
  page.on('pageerror',error => errors.push(error.message));
  page.on('console',message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request',request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  const url = pathToFileURL(path.join(__dirname,'index.html')).href;
  const text = selector => page.$eval(selector,element => element.textContent);
  const value = selector => page.$eval(selector,element => element.value);
  const click = async selector => {
    await page.$eval(selector,element => element.scrollIntoView({block:'center',behavior:'instant'}));
    await page.click(selector);
  };
  const fill = (selector,content) => page.$eval(selector,(element,content) => {
    element.value = content;
    element.dispatchEvent(new Event('input',{bubbles:true}));
  },String(content));
  const mark = label => { passed.push(label); console.log('PASS ' + label); };
  const waitText = (selector,fragment) => page.waitForFunction((selector,fragment) => document.querySelector(selector)?.textContent.includes(fragment),{timeout:4000},selector,fragment);
  const navigate = (app,tab) => click(`#${app === 'hooky' ? 'h' : 'r'}-workbench [data-action="page"][data-page="${tab}"]`);
  const assertNoOverflow = async label => {
    const overflow = await page.evaluate(() => ({
      body:document.documentElement.scrollWidth > innerWidth + 1,
      surfaces:[...document.querySelectorAll('.app-surface,.editor,.editor-scroll,.popup-body')].filter(element => element.offsetWidth && element.scrollWidth > element.clientWidth + 1).map(element => ({id:element.id,class:element.className,client:element.clientWidth,scroll:element.scrollWidth}))
    }));
    assert.equal(overflow.body,false,label + ': document overflow');
    assert.deepEqual(overflow.surfaces,[],label + ': panel overflow');
  };
  try {
    await page.setViewport({width:1440,height:1080,deviceScaleFactor:1});
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.goto(url,{waitUntil:'load'});
    assert.deepEqual(await page.$$eval('.popup',items => items.map(item => item.offsetWidth)),[360,360]);
    assert(await page.$$eval('.popup',items => items.every(item => item.offsetHeight <= 600)));
    assert.deepEqual(await page.$$eval('.workbench',items => items.map(item => Math.round(item.getBoundingClientRect().top))),[await page.$eval('#h-workbench',item=>Math.round(item.getBoundingClientRect().top)),await page.$eval('#h-workbench',item=>Math.round(item.getBoundingClientRect().top))]);
    await assertNoOverflow('initial desktop');
    mark('360px popup bounds, aligned workspaces, file:// loading');

    await fill('#h-name','阅读 & 设计 <收件箱>');
    await fill('#h-url','https://hooks.example.com/inbox?source=chrome');
    await page.select('#h-method','GET');
    assert.match(await text('#h-preview-code'),/GET https:\/\/hooks\.example\.com\/inbox\?source=chrome&url=https%3A/);
    await click('[data-action="add-param"]');
    await fill('[data-param-key="3"]','image');
    await page.focus('[data-param-value="3"]');
    await click('.more-variables summary');
    await click('[data-action="insert-variable"][data-value="page.meta.og:image"]');
    assert.equal(await value('[data-param-value="3"]'),'{{page.meta.og:image}}');
    await click('[form="h-template-form"]');
    assert.match(await text('#h-popup-template'),/阅读 & 设计 <收件箱>/);
    assert.equal(await value('[data-popup-param="3"]'),'https://images.example.com/a-quieter-web.jpg');
    mark('template save, HTML escaping, variables, GET query serialization, popup sync');

    await fill('[data-popup-param="1"]','Literal {{keep.me}} & 中文');
    await click('#h-send');
    await waitText('#h-popup','演示成功');
    await click('#h-sent-request summary');
    assert.match(await text('#h-sent-request pre'),/title=Literal\+%7B%7Bkeep.me%7D%7D\+%26\+%E4%B8%AD%E6%96%87/);
    await page.select('#h-scenario','error');
    await click('#h-send'); await waitText('#h-popup','HTTP 503');
    await page.select('#h-scenario','success');
    await page.select('#h-popup-template','discord');
    assert.match(await value('[data-popup-param="0"]'),/\nhttps:\/\//);
    await click('#h-send'); await waitText('#h-popup','演示成功');
    await click('#h-sent-request summary');
    const body = JSON.parse(await text('#h-sent-request pre'));
    assert.equal(body.content,'让浏览器工具回归轻盈\nhttps://notes.example.com/a-quieter-web');
    mark('send success/failure, edited values stay literal, multiline JSON payload');

    await navigate('hooky','rules');
    await click('[data-action="test-rules"]');
    await waitText('.rule-tester','第 1 条规则命中');
    await fill('#h-rule-url','https://github.com/nocoo/hooky');
    await click('[data-action="test-rules"]');
    await waitText('.rule-tester','第 2 条规则命中');
    await fill('#h-rule-url','https://example.com/no-match');
    await click('[data-action="test-rules"]');
    await waitText('.rule-tester','没有规则命中');
    await click('[data-action="add-rule"]');
    const newRule = await page.$eval('.rule-card:last-child',item => item.dataset.rule);
    const ruleForm = `[data-rule-form="${newRule}"]`;
    await page.select(`${ruleForm} [data-rule-field="operator"]`,'matches');
    await fill(`${ruleForm} [data-rule-field="value"]`,'[');
    await click(`${ruleForm} button[type="submit"]`);
    assert.match(await text(`${ruleForm} [data-rule-error]`),/正则表达式无效/);
    await fill(`${ruleForm} [data-rule-field="value"]`,'example\\.com');
    await click(`${ruleForm} button[type="submit"]`);
    await click('[data-action="test-rules"]');
    await waitText('.rule-tester','第 4 条规则命中');
    await click(`${ruleForm} [data-action="move-rule"][data-offset="-1"]`);
    await click('[data-action="test-rules"]');
    await waitText('.rule-tester','第 3 条规则命中');
    await click(`${ruleForm} [data-rule-field="enabled"]`);
    await click(`${ruleForm} button[type="submit"]`);
    await click('[data-action="test-rules"]');
    await waitText('.rule-tester','没有规则命中');
    mark('first-match rule ordering, disabled rules, fallback, regex validation');

    await click('[data-action="context"]');
    await fill('#context-form [name="url"]','https://notes.example.com/new');
    await fill('#context-form [name="title"]','新的示例页面');
    await fill('#context-form [name="selection"]','选区已经变化');
    await click('#context-form button[type="submit"]');
    assert.match(await text('#h-popup .page-context'),/新的示例页面/);
    assert.match(await text('#r-popup .page-context'),/新的示例页面/);
    mark('shared demo context updates both tools');

    await fill('#r-endpoint','https://another-account.r2.cloudflarestorage.com/review-shots');
    await page.$eval('#r-endpoint',element => element.dispatchEvent(new Event('change',{bubbles:true})));
    assert.equal(await value('#r-endpoint'),'https://another-account.r2.cloudflarestorage.com');
    assert.equal(await value('#r-bucket'),'review-shots');
    await click('[data-action="show-secret"]');
    assert.equal(await page.$eval('#r-secret',item => item.type),'text');
    await click('[data-action="show-secret"]');
    assert.equal(await page.$eval('#r-secret',item => item.type),'password');
    await fill('#r-domain','https://shots.example.com/');
    await click('[form="r-config-form"]');
    assert.equal(await value('#r-domain'),'shots.example.com');
    assert.match(await text('#r-popup .storage-destination'),/review-shots/);
    await click('[data-action="test-connection"]');
    await waitText('#r-connection-result','演示连接成功');
    mark('R2 endpoint parsing, secret visibility, domain normalization, connection test');

    await navigate('r2shot','capture');
    await fill('#r-quality-range',76);
    assert.equal(await value('#r-quality-number'),'76');
    await fill('#r-max-screens',8);
    await click('[form="r-config-form"]');
    await click('[data-action="capture-mode"][data-value="full"]');
    assert.match(await text('#r-popup .capture-meta'),/最多 8 屏/);
    assert.match(await text('#r-popup .capture-meta'),/76%/);
    await fill('#r-quality-number',101);
    await click('[form="r-config-form"]');
    assert.equal(await page.$eval('#r-quality-number',item => item.validity.valid),false);
    assert.match(await text('#r-popup .capture-meta'),/76%/);
    await fill('#r-quality-number',76);
    await click('[data-action="capture"]');
    await waitText('#r-popup','截图已就绪');
    const resultUrl = await text('#r-result-link');
    assert.match(resultUrl,/^https:\/\/shots\.example\.com\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.jpg$/);
    await page.evaluate(() => Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value => {window.__copiedDemoUrl = value;}}}));
    await click('[data-action="copy-url"]');
    assert.equal(await page.evaluate(() => window.__copiedDemoUrl),resultUrl);
    await page.evaluate(() => {
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async () => {throw new Error('Permission denied in test');}}});
      document.execCommand = () => false;
    });
    await click('[data-action="copy-url"]');
    await waitText('#studio-toast','链接已选中');
    assert.equal(await page.evaluate(() => getSelection().toString()),resultUrl);
    await page.select('#r-scenario','error');
    await click('[data-action="capture"]'); await waitText('#r-popup','这次没有上传成功');
    await click('[data-action="test-connection"]'); await waitText('#r-connection-result','演示连接失败');
    mark('quality bounds, full-page limit, capture states, clipboard call and denial fallback');

    await page.select('#h-scenario','empty');
    assert.match(await text('#h-popup'),/创建第一个模板/);
    await click('#h-popup [data-action="new-template"]');
    await fill('#h-name','全新的模板');
    await fill('#h-url','https://hooks.example.com/new');
    await click('[form="h-template-form"]');
    assert.match(await text('#h-popup-template'),/全新的模板/);
    await click('[data-action="delete-template"]');
    await click('#confirm-action');
    assert.match(await text('#h-popup'),/创建第一个模板/);
    await page.select('#r-scenario','empty');
    assert.match(await text('#r-popup'),/连接存储空间/);
    await fill('#r-endpoint','https://new-account.r2.cloudflarestorage.com');
    await fill('#r-access','demo-new-key'); await fill('#r-secret','demo-new-secret');
    await fill('#r-bucket','new-shots'); await fill('#r-domain','new.example.com');
    await click('[form="r-config-form"]');
    assert.match(await text('#r-popup'),/截图并上传/);
    mark('empty states, first template setup, delete confirmation, first R2 setup');

    await page.reload({waitUntil:'load'});
    assert.equal(await value('#h-name'),'阅读收件箱');
    assert.equal(await value('#r-bucket'),'my-screenshots');
    await click('[data-action="direction"][data-value="line"]');
    assert.equal(await page.$eval('.popup',item=>getComputedStyle(item).borderRadius),'6px');
    await click('[data-action="density"]');
    assert.equal(await page.$eval('#h-name',item=>item.offsetHeight),38);
    await click('[data-action="canvas-theme"]');
    assert.deepEqual(await page.$$eval('.app-study',items=>items.map(item=>item.dataset.theme)),['dark','dark']);
    await navigate('hooky','appearance');
    await click('[name="hooky-theme"][value="light"]');
    assert.deepEqual(await page.$$eval('.app-study',items=>items.map(item=>item.dataset.theme)),['light','dark']);
    await click('[name="hooky-theme"][value="system"]');
    await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'},{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.waitForFunction(()=>document.querySelector('#study-hooky').dataset.theme==='dark');
    await click('[data-action="about"]');
    assert.equal(await page.$eval('#about-dialog',item=>item.open),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('#about-dialog',item=>item.open),false);
    mark('reload isolation, both visual directions, density, independent/system themes, native dialogs');

    await page.reload({waitUntil:'load'});
    for (const width of [1920,1440,1280,1024,800,390,360]) {
      await page.setViewport({width,height:1000,deviceScaleFactor:1});
      await assertNoOverflow('width ' + width);
      for (const [app,tab] of [['hooky','rules'],['hooky','appearance'],['r2shot','capture'],['r2shot','appearance']]) {
        await navigate(app,tab); await assertNoOverflow(`${width} ${app} ${tab}`);
      }
      await navigate('hooky','templates'); await navigate('r2shot','connection');
    }
    mark('all main pages at 1920 / 1440 / 1280 / 1024 / 800 / 390 / 360px');

    await page.setViewport({width:1440,height:1080,deviceScaleFactor:1});
    await click('#h-settings-section [data-action="expand"]');
    assert.equal(await page.$eval('#study-r2shot',item=>getComputedStyle(item).display),'none');
    assert.equal(await page.$eval('#h-workbench',item=>item.offsetWidth),1120);
    await assertNoOverflow('expanded workspace');
    await click('[data-action="view"][data-value="both"]');
    await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
    await page.screenshot({path:path.join(__dirname,'preview-light.png'),fullPage:true});
    await click('[data-action="canvas-theme"]');
    await click('[data-action="direction"][data-value="line"]');
    await navigate('hooky','rules'); await navigate('r2shot','capture');
    await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
    await page.screenshot({path:path.join(__dirname,'preview-dark.png'),fullPage:true});
    mark('expanded 1120px workspace, light and dark review screenshots');
    assert.deepEqual(errors,[],'browser console/runtime errors');
    assert.deepEqual(requests,[],'unexpected network requests');
    mark('zero page errors and zero HTTP requests');
    const files = ['index.html','ui.css','ui.js','assets/hooky.png','assets/r2shot.png'];
    const report = {checks:passed,errors,networkRequests:requests.length,runtimeBytes:Object.fromEntries(files.map(name=>[name,fs.statSync(path.join(__dirname,name)).size]))};
    fs.writeFileSync(path.join(__dirname,'check-results.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
  } catch (error) {
    await page.screenshot({path:'/tmp/extension-concept-check-failure.png',fullPage:true});
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
