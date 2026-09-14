const fs = require('node:fs/promises');
const path = require('node:path');
const {root, slug: product, version, source, output} = require('./paths.cjs');
const enc = (value) => JSON.stringify(value).replaceAll('<', '\\u003c');
const data = (bytes, mime) => `data:${mime};base64,${bytes.toString('base64')}`;
const frames = {};
const dictionaries = {};
const icons = {};

async function embed(slug, view, relativeFile) {
  const folder = path.join(output, 'unpacked');
  const file = path.join(folder, relativeFile);
  const imports = {};
  const resolve = (name, parent) => name.startsWith('/') ? path.join(folder, name.slice(1)) : path.resolve(path.dirname(parent), name);
  const key = (file) => `preview/${slug}/${path.relative(folder, file)}`;
  async function module(file) {
    const name = key(file);
    if (imports[name]) return name;
    imports[name] = 'pending';
    let source = await fs.readFile(file, 'utf8');
    const pattern = /\b(from|import)\s*(["'`])([^"'`]+)\2/g;
    for (const match of [...source.matchAll(pattern)].reverse()) {
      if (!match[3].startsWith('.')) continue;
      const dependency = await module(resolve(match[3], file));
      source = source.slice(0, match.index) + `${match[1]} ${JSON.stringify(dependency)}` + source.slice(match.index + match[0].length);
    }
    imports[name] = data(Buffer.from(source), 'text/javascript');
    return name;
  }
  let html = await fs.readFile(file, 'utf8');
  const entries = [];
  for (const match of [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g)].reverse()) {
    entries.unshift(await module(resolve(match[1], file)));
    html = html.replace(match[0], '');
  }
  for (const match of [...html.matchAll(/<link\b[^>]*>/g)]) {
    const href = match[0].match(/href="([^"]+)"/)?.[1];
    if (!href) continue;
    if (match[0].includes('stylesheet')) {
      html = html.replace(match[0], `<style>${await fs.readFile(resolve(href, file), 'utf8')}</style>`);
    } else if (match[0].includes('modulepreload')) {
      html = html.replace(match[0], '');
    } else if (match[0].includes('icon')) {
      html = html.replace(match[0], match[0].replace(href, data(await fs.readFile(resolve(href, file)), 'image/png')));
    }
  }
  for (const match of [...html.matchAll(/<img\b[^>]*src="([^"]+)"[^>]*>/g)]) {
    html = html.replace(match[0], match[0].replace(match[1], data(await fs.readFile(resolve(match[1], file)), 'image/png')));
  }
  const frameCSS = view === 'workspace' ? 'body{padding:0!important}.layout,.settings-layout{margin:0!important;max-width:none!important;border:0!important;border-radius:0!important;box-shadow:none!important}' : '';
  html = html.replace('</head>', `<style>${frameCSS}</style><script>window.chrome=parent.previewAPI(${enc(slug)},${enc(view)},window);window.fetch=(...args)=>parent.previewFetch(${enc(slug)},...args);</script><script type="importmap">${enc({ imports })}</script></head>`);
  const start = `<script type="module">${entries.map(name => `import ${JSON.stringify(name)};`).join('')}new ResizeObserver(()=>parent.resizePreview(${enc(slug)},${enc(view)},document.body.scrollHeight)).observe(document.body);</script>`;
  return html.replace('</body>', start + '</body>');
}

(async () => {
  for (const slug of [product]) {
    dictionaries[slug] = JSON.parse(await fs.readFile(path.join(output, 'unpacked/_locales/en/messages.json'), 'utf8'));
    icons[slug] = data(await fs.readFile(path.join(output, 'store/icon-128.png')), 'image/png');
    frames[slug] = {};
    for (const view of ['workspace', 'popup']) {
      const file = slug === 'hooky' ? (view === 'workspace' ? 'src/options/options.html' : 'src/popup/popup.html') : (view === 'workspace' ? 'settings.html' : 'popup.html');
      frames[slug][view] = await embed(slug, view, file);
    }
  }
  const font = data(await fs.readFile(path.join(source, 'brand/space-grotesk.woff2')), 'font/woff2');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${product === "hooky" ? "Hooky" : "R2Shot"} ${version} — Interactive preview</title><style>
@font-face{font-family:Space;src:url('${font}') format('woff2');font-weight:300 700;font-display:swap}*{box-sizing:border-box}body{margin:0;background:#f5f4f0;color:#30372e;font:14px/1.6 system-ui}a{color:inherit;text-underline-offset:4px}button,input,select{font:inherit}button,select{cursor:pointer}button{background:#fff;border:1px solid #d9ddd3;color:inherit;padding:8px 13px;border-radius:7px}button:hover{background:#edf0e7}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #627e51;outline-offset:3px}.top{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #daddd3;padding:22px 32px;gap:24px}.top a{text-decoration:none}.top nav{display:flex;gap:20px}.wordmark{font:600 20px Space,sans-serif;letter-spacing:-1px}.top small{color:#767c70;font:11px ui-monospace,monospace}main{max-width:1640px;margin:auto;padding:36px 32px 80px}.intro{display:flex;align-items:end;justify-content:space-between;gap:30px;margin-bottom:28px}.intro h1{font:500 clamp(28px,3vw,48px)/1.1 Space,sans-serif;letter-spacing:-2px;margin:0 0 16px}.intro p{color:#68705f;max-width:800px;margin:0}.context{border:1px solid #daddd3;border-radius:10px;padding:14px 18px;background:#fbfcf8;margin-bottom:42px}.context summary{cursor:pointer;font-weight:550}.context-form{display:grid;grid-template-columns:1.4fr 1fr 1fr auto;gap:14px;align-items:end;margin-top:18px}.context label{font-size:11px;color:#68705f}.context input{display:block;min-width:0;width:100%;margin-top:6px;padding:9px;border:1px solid #daddd3;border-radius:6px;background:#fff;color:#30372e;font-size:12px}.product{--accent:#7851a5;--tint:#f1ebf7;margin:0 0 64px;scroll-margin-top:20px}.product.r2shot{--accent:#177c70;--tint:#eaf5f1}.product-head{display:flex;justify-content:space-between;align-items:center;gap:20px;margin:0 0 18px}.product-name{display:flex;align-items:center;gap:12px}.product-name img{width:46px;height:46px;object-fit:contain}.product-name h2{font:600 27px Space,sans-serif;letter-spacing:-1px;margin:0}.product-name small{display:block;color:var(--accent);font-size:11px}.controls{display:flex;gap:9px;align-items:center;font-size:11px}.controls label{display:flex;align-items:center;gap:8px;color:#68705f}.controls select{background:white;border:1px solid #daddd3;border-radius:7px;padding:8px}.demo-screens{display:grid;grid-template-columns:minmax(0,1fr) 362px;gap:22px;align-items:start}.demo-screens>div{min-width:0}.demo-screens.focus{grid-template-columns:minmax(0,1fr)}.demo-screens.focus .popup-column{display:none}.screen-label{display:flex;justify-content:space-between;align-items:center;color:#68705f;font:10px ui-monospace,monospace;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px}.frame-box{position:relative;background:var(--tint);border:1px solid color-mix(in srgb,var(--accent) 15%,#eee);border-radius:12px;overflow:hidden;box-shadow:0 3px 5px #27352403,0 14px 32px #27352406}iframe{display:block;border:0;transform-origin:top left;background:transparent}.options-box{width:100%}.popup-box{width:362px;max-width:100%}.popup-column button{margin-top:12px;width:100%;font-size:11px}.activity{border-top:1px solid #daddd3;padding-top:13px;margin-top:20px}.activity summary{color:#68705f;font-size:11px;cursor:pointer}.activity pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.7 ui-monospace,monospace;padding:15px;background:#fcfcf9;border-radius:8px;max-height:300px;overflow:auto}.foot{font-size:12px;color:#68705f;border-top:1px solid #daddd3;padding-top:20px;display:flex;justify-content:space-between;gap:16px}@media(max-width:900px){.top small{display:none}.top,main{padding-left:18px;padding-right:18px}.top nav{gap:12px;font-size:12px}.intro,.product-head{align-items:start;flex-direction:column}.context-form{grid-template-columns:1fr 1fr}.demo-screens{grid-template-columns:minmax(0,1fr)}.popup-column{width:362px;max-width:100%;margin:0 auto}.controls{flex-wrap:wrap}.options-box{min-height:220px}.foot{flex-direction:column}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
</style></head><body><header class="top"><a class="wordmark" href="https://hexly.ai" target="_blank" rel="noopener">hexly.ai</a><nav><a href="#${product}">${product === "hooky" ? "Hooky" : "R2Shot"}</a><a href="index.html">Release materials ↗</a></nav><small>EXTENSION FAMILY / 2.0.0</small></header><main><div class="intro"><div><h1>${product === "hooky" ? "Hooky" : "R2Shot"}. A familiar feel.</h1><p>Explore the settings workspace and toolbar popup. Edit the demo configuration, switch a theme, and try the main action. Demo requests are simulated and use example data.</p></div><button id="reset">Reset demo</button></div><details class="context"><summary>Demo page context</summary><form class="context-form" id="context-form"><label>Page URL<input id="demo-url" type="url" value="https://notes.example.com/field-notes" required></label><label>Page title<input id="demo-title" value="Designing a calmer workflow" required></label><label>Selected text<input id="demo-selection" value="Good tools give your attention back."></label><button>Update popups</button></form></details>
${[product].map(slug=>`<section class="product ${slug}" id="${slug}"><div class="product-head"><div class="product-name"><img src="${icons[slug]}" alt=""><div><h2>${slug==='hooky'?'Hooky':'R2Shot'}</h2><small>${slug==='hooky'?'Wisteria / Browser → webhook':'Sea glass / Browser → your R2 bucket'}</small></div></div><div class="controls"><label>Demo response<select id="${slug}-response"><option value="success">Success</option><option value="error">Request failure</option></select></label><button data-focus="${slug}">Expand workspace</button></div></div><div class="demo-screens" id="${slug}-screens"><div><div class="screen-label"><span>Workspace</span><span>2.0.0</span></div><div class="frame-box options-box" id="${slug}-workspace-box"><iframe width="1120" height="760" id="${slug}-workspace" title="${slug} interactive settings" allow="clipboard-write"></iframe></div></div><div class="popup-column"><div class="screen-label"><span>Toolbar popup</span><span>360 px</span></div><div class="frame-box popup-box" id="${slug}-popup-box"><iframe width="360" height="550" id="${slug}-popup" title="${slug} interactive popup" allow="clipboard-write"></iframe></div><button data-refresh="${slug}">Refresh popup</button></div></div><details class="activity" open><summary>Demo activity · no requests leave this preview</summary><pre id="${slug}-activity">${slug==='hooky'?'Send a demo webhook to inspect its parameters here.':'Try a capture or a connection test. Results appear here.'}</pre></details></section>`).join('')}
<footer class="foot"><span>The original logo. A focused workspace. A product of <a href="https://hexly.ai" target="_blank" rel="noopener">hexly.ai</a>.</span><span>Use the packaged extensions for real capture and network requests.</span></footer></main><script>
const frames=${enc(frames)},dictionaries=${enc(dictionaries)};
const seed={hooky:{hooky:{templates:[{id:'reading',name:'Reading list',url:'https://hooks.example.com/reading-list',method:'POST',params:[{key:'title',value:'{{page.title}}'},{key:'url',value:'{{page.url}}'},{key:'note',value:'{{page.selection}}'}]},{id:'team',name:'Share with the team',url:'https://hooks.example.com/team',method:'POST',params:[{key:'text',value:'{{page.title}} — {{page.url}}'}]},{id:'deploy',name:'Deploy preview',url:'https://hooks.example.com/deploy',method:'POST',params:[{key:'repository',value:'{{page.url}}'}]}],activeTemplateId:'reading',quickSendRules:[{id:'github',field:'url',operator:'contains',value:'github.com',templateId:'deploy',enabled:true},{id:'notes',field:'url',operator:'startsWith',value:'https://notes.example.com',templateId:'reading',enabled:true}],theme:'light'}},r2shot:{r2config:{endpoint:'https://demo.r2.cloudflarestorage.com',bucketName:'screenshots',accessKeyId:'EXAMPLE_KEY_FOR_DEMO',secretAccessKey:'EXAMPLE_SECRET_FOR_DEMO',customDomain:'images.example.com',jpgQuality:90,maxScreens:5},r2shot_theme:'light'}};
let stores=structuredClone(seed),windows={hooky:{},r2shot:{}},heights={};
let context={page:{url:'https://notes.example.com/field-notes',title:'Designing a calmer workflow',selection:'Good tools give your attention back.',meta:{description:'A field guide to thoughtful browser tools.','og:title':'Small tools, useful connections','og:description':'A calmer workflow starts with a few thoughtful tools.','og:image':'https://notes.example.com/cover.jpg'}}};
const initialContext=structuredClone(context);
const byId=id=>document.getElementById(id);
function refresh(slug,view='popup'){byId(slug+'-'+view).srcdoc=frames[slug][view]}
function resizePreview(slug,view,height){const frame=byId(slug+'-'+view),box=byId(slug+'-'+view+'-box');heights[slug+'-'+view]=height;const scale=Math.min(1,box.clientWidth/(view==='workspace'?1120:360));frame.style.height=height+'px';frame.style.transform='scale('+scale+')';box.style.height=Math.ceil(height*scale)+2+'px'}
function log(slug,value){byId(slug+'-activity').textContent=typeof value==='string'?value:JSON.stringify(value,null,2)}
function response(slug){return byId(slug+'-response').value==='error'}
async function previewFetch(slug,url,options={}){log(slug,{mode:'Simulated request',url,method:options.method||'GET',body:options.body});return {ok:!response(slug),status:response(slug)?403:200}}
function previewAPI(slug,view,win){
 const listeners=[];windows[slug][view]={win,listeners};
 return {i18n:{getUILanguage:()=> 'en-US',getMessage:(key,substitutions=[])=>{const entry=dictionaries[slug][key];if(!entry)return '';let message=entry.message;const values=Array.isArray(substitutions)?substitutions:[substitutions];for(const [name,p]of Object.entries(entry.placeholders||{})){const value=p.content.replace(/[$]([0-9]+)/g,(_,n)=>values[n-1]??'');message=message.replace(new RegExp('[$]'+name+'[$]','gi'),()=>value)}return message}},
 storage:{local:{get:async(keys)=>{const state=structuredClone(stores[slug]);if(!keys)return state;if(typeof keys==='string')return {[keys]:state[keys]};return Object.fromEntries(keys.map(key=>[key,state[key]]))},set:async(values)=>{const changes=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{oldValue:stores[slug][key],newValue:structuredClone(value)}]));Object.assign(stores[slug],structuredClone(values));for(const window of Object.values(windows[slug]))for(const listener of window.listeners)listener(changes,'local');if(view==='workspace')setTimeout(()=>refresh(slug),0)}},onChanged:{addListener:listener=>listeners.push(listener)}},
 tabs:{query:async()=>[{id:1,active:true,windowId:1,url:context.page.url,title:context.page.title}]},scripting:{executeScript:async()=>[{result:structuredClone(context)}]},
 runtime:{getManifest:()=>({version:${enc(version)}}),openOptionsPage:()=>{byId(slug).scrollIntoView({behavior:'smooth'});byId(slug+'-workspace').focus()},sendMessage:async message=>{
 await new Promise(resolve=>setTimeout(resolve,350));
 if(message.type==='EXECUTE_WEBHOOK'){const config=message.config;let url;try{url=new URL(config.url);if(!['http:','https:'].includes(url.protocol))throw Error()}catch{return {ok:false,error:'Enter a valid webhook URL.'}}const parameters=Object.fromEntries(config.params.map(p=>[p.key,p.value]));if(['GET','DELETE'].includes(config.method))for(const [key,value]of Object.entries(parameters))url.searchParams.set(key,value);log(slug,{mode:'Simulated webhook',method:config.method,url:url.href,...(['GET','DELETE'].includes(config.method)?{}:{json:parameters}),status:response(slug)?403:200});return {ok:!response(slug),status:response(slug)?403:200}}
 if(message.type==='VERIFY_CONNECTION'){log(slug,{mode:'Simulated bucket connection test',method:'HEAD',endpoint:message.config.endpoint,bucket:message.config.bucketName,status:response(slug)?403:200});return {success:!response(slug),error:'Demo: access denied'}}
 const config=stores.r2shot.r2config,url='https://'+config.customDomain+'/2026-09-14/demo-'+(message.fullPage?'full-page':'visible')+'.jpg';log(slug,{mode:'Simulated capture and upload',scope:message.fullPage?'Full page':'Visible area',bucket:config.bucketName,quality:config.jpgQuality,publicURL:url,status:response(slug)?403:200});return {success:!response(slug),url,error:'Demo: upload denied. Choose Success above to retry.'}
 }}
 }
}
for(const slug of ${enc([product])})for(const view of ['workspace','popup']){refresh(slug,view);new ResizeObserver(()=>{if(heights[slug+'-'+view])resizePreview(slug,view,heights[slug+'-'+view])}).observe(byId(slug+'-'+view+'-box'))}
for(const button of document.querySelectorAll('[data-refresh]'))button.onclick=()=>refresh(button.dataset.refresh);
for(const button of document.querySelectorAll('[data-focus]'))button.onclick=()=>{const focus=byId(button.dataset.focus+'-screens').classList.toggle('focus');button.textContent=focus?'Show workspace + popup':'Expand workspace'};
byId('context-form').onsubmit=event=>{event.preventDefault();Object.assign(context.page,{url:byId('demo-url').value,title:byId('demo-title').value,selection:byId('demo-selection').value});refresh(${enc(product)})};
byId('reset').onclick=()=>{stores=structuredClone(seed);context=structuredClone(initialContext);byId('context-form').reset();for(const slug of ${enc([product])}){byId(slug+'-response').value='success';refresh(slug,'workspace');refresh(slug);log(slug,'Demo reset. Ready for another try.')}};
</script></body></html>`;
  const license = await fs.readFile(path.join(source, 'brand/space-grotesk-ofl.txt'), 'utf8');
  const licensedHTML = html.replace('</body>', '<!-- Embedded Space Grotesk font license: '+license.replaceAll('-->', '')+' --></body>');
  await fs.writeFile(path.join(output, 'preview.html'), licensedHTML);
  console.log('Created standalone interactive preview:', Buffer.byteLength(licensedHTML), 'bytes');
})().catch(error => { console.error(error); process.exitCode = 1; });
