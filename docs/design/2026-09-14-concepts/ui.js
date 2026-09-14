/* A local interaction study. No extension APIs, storage, requests, or dependencies. */
'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clone = value => structuredClone(value);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const brand = (app, subtitle = '') => `<div class="product-brand"><img src="assets/${app}.png" alt="" width="27" height="27"><span>${app === 'hooky' ? 'Hooky' : 'R2Shot'}</span>${subtitle ? `<span class="brand-divider"></span><span class="surface-name">${subtitle}</span>` : ''}</div>`;
const selected = (a, b) => a === b ? ' selected' : '';
const checked = value => value ? ' checked' : '';
const disabled = value => value ? ' disabled' : '';
const uid = () => crypto.randomUUID();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
const operators = {contains:'包含', equals:'等于', startsWith:'开头是', endsWith:'结尾是', matches:'正则匹配'};
const variables = ['page.url','page.title','page.selection','page.meta.description','page.meta.og:title','page.meta.og:description','page.meta.og:image'];

const initial = {
  page: {
    url: 'https://notes.example.com/a-quieter-web',
    title: '让浏览器工具回归轻盈',
    selection: '让每一个像素，都服务于眼前的事。',
    meta: {description:'关于更轻、更顺手的浏览器工具的一些思考。', 'og:title':'让浏览器工具回归轻盈', 'og:description':'一些关于日常工具与安静界面的设计笔记。', 'og:image':'https://images.example.com/a-quieter-web.jpg'}
  },
  hooky: {
    theme: 'light', activeId:'inbox',
    templates: [
      {id:'inbox',name:'阅读收件箱',method:'POST',url:'https://hooks.example.com/inbox',params:[{key:'url',value:'{{page.url}}'},{key:'title',value:'{{page.title}}'},{key:'note',value:'{{page.selection}}'}]},
      {id:'discord',name:'分享到 Discord',method:'POST',url:'https://hooks.example.com/discord',params:[{key:'content',value:'{{page.title}}\n{{page.url}}'},{key:'username',value:'Hooky'}]},
      {id:'task',name:'添加到待办',method:'POST',url:'https://hooks.example.com/tasks',params:[{key:'title',value:'读一读：{{page.title}}'},{key:'link',value:'{{page.url}}'},{key:'description',value:'{{page.meta.description}}'}]}
    ],
    rules: [
      {id:'reading-rule',field:'url',operator:'contains',value:'notes.example.com',templateId:'inbox',enabled:true},
      {id:'github-rule',field:'url',operator:'contains',value:'github.com',templateId:'task',enabled:true},
      {id:'release-rule',field:'title',operator:'matches',value:'release|发布',templateId:'discord',enabled:false}
    ]
  },
  r2shot: {
    theme:'light',
    config:{endpoint:'https://demo-account.r2.cloudflarestorage.com',accessKeyId:'demo-access-key',secretAccessKey:'demo-secret-for-ui-study',bucketName:'my-screenshots',customDomain:'images.example.com',jpgQuality:90,maxScreens:5}
  }
};

let state = clone(initial);
let hPage = 'templates';
let hSelected = 'inbox';
let hDrafts = new Map();
let ruleDrafts = new Map();
let openRules = new Set(['reading-rule']);
let hOverrides = [];
let hSend = {phase:'idle'};
let hGeneration = 0;
let hTest = null;
let lastParam = 0;
let previewOpen = true;
let rPage = 'connection';
let rDraft = clone(state.r2shot.config);
let rMode = false;
let rCapture = {phase:'idle'};
let rConnection = {phase:'idle'};
let rGeneration = 0;
let connectionGeneration = 0;
let pendingConfirm = null;
let toastTimer;

function toast(message) {
  clearTimeout(toastTimer);
  const element = $('#studio-toast');
  element.textContent = message;
  element.classList.add('visible');
  toastTimer = setTimeout(() => element.classList.remove('visible'), 2800);
}

function resolveValue(value, page = state.page) {
  return String(value ?? '').replace(/\{\{\s*(.+?)\s*\}\}/g, (_, path) => {
    const resolved = path.trim().split('.').reduce((value, key) => value?.[key], {page});
    return resolved == null ? '' : String(resolved);
  });
}

function validHttpUrl(value) {
  try { return ['https:', 'http:'].includes(new URL(value).protocol); }
  catch { return false; }
}

function requestFor(template, params = template.params, resolve = true) {
  const query = ['GET', 'DELETE'].includes(template.method);
  const pairs = params.filter(param => param.key.trim()).map(param => [param.key, resolve ? resolveValue(param.value) : param.value]);
  if (query) {
    if (!validHttpUrl(template.url)) return {mode:'QUERY STRING', text:'填写有效的请求地址后，即可预览查询参数。'};
    const url = new URL(template.url);
    for (const [key,value] of pairs) url.searchParams.append(key,value);
    return {mode:'QUERY STRING', text:`${template.method} ${url.href}`};
  }
  return {mode:'JSON BODY', text:JSON.stringify(Object.fromEntries(pairs), null, 2)};
}

function matchesRule(rule, page) {
  const text = String(page[rule.field] || '').toLowerCase();
  const value = String(rule.value || '').toLowerCase();
  if (!text || !value) return false;
  switch (rule.operator) {
    case 'contains': return text.includes(value);
    case 'equals': return text === value;
    case 'startsWith': return text.startsWith(value);
    case 'endsWith': return text.endsWith(value);
    case 'matches':
      try { return new RegExp(rule.value, 'i').test(String(page[rule.field])); }
      catch { return false; }
    default: return false;
  }
}

function findRule(page = state.page) {
  const rule = state.hooky.rules.find(rule => rule.enabled && matchesRule(rule, page));
  if (!rule) return null;
  const template = state.hooky.templates.find(template => template.id === rule.templateId);
  return {rule, template:template && validHttpUrl(template.url) ? template : null};
}

function draftTemplate() {
  const saved = state.hooky.templates.find(template => template.id === hSelected);
  if (!saved) return null;
  if (!hDrafts.has(hSelected)) hDrafts.set(hSelected, clone(saved));
  return hDrafts.get(hSelected);
}

function draftRule(id) {
  if (!ruleDrafts.has(id)) ruleDrafts.set(id, clone(state.hooky.rules.find(rule => rule.id === id)));
  return ruleDrafts.get(id);
}

function templateDirty() {
  const saved = state.hooky.templates.find(template => template.id === hSelected);
  return saved && JSON.stringify(saved) !== JSON.stringify(draftTemplate());
}

function rDirty() { return JSON.stringify(rDraft) !== JSON.stringify(state.r2shot.config); }

function pageContext() {
  let host = state.page.url;
  try { host = new URL(host).hostname; } catch { /* A form validates URLs before applying. */ }
  return `<div class="page-context"><span class="context-icon">${icon('globe')}</span><div class="page-context-text"><strong title="${esc(state.page.title)}">${esc(state.page.title)}</strong><small title="${esc(state.page.url)}">${esc(host)}</small></div><span class="badge neutral">当前网页</span></div>`;
}

function popupHeader(app) {
  return `<div class="popup-header">${brand(app)}<button type="button" class="icon-button" data-action="navigate" data-app="${app}" data-page="${app === 'hooky' ? 'templates' : 'connection'}" aria-label="打开 ${app === 'hooky' ? 'Hooky' : 'R2Shot'} 设置" title="打开设置">${icon('settings')}</button></div>`;
}

function popupFooter(app) {
  return `<div class="popup-bottom"><span class="demo-caption"><span class="status-dot"></span>本地演示</span><button type="button" class="text-button" data-action="navigate" data-app="${app}" data-page="${app === 'hooky' ? 'rules' : 'connection'}">${icon(app === 'hooky' ? 'bolt' : 'cloud')}${app === 'hooky' ? '快捷发送规则' : 'R2 连接设置'}</button></div>`;
}

function renderHPopup() {
  const template = state.hooky.templates.find(template => template.id === state.hooky.activeId) || state.hooky.templates[0];
  if (!template) {
    $('#h-popup').innerHTML = popupHeader('hooky') + `<div class="empty-state">${icon('link')}<h3>让网页有个好去处</h3><p>创建第一个 Webhook 模板，把页面信息送到你的工作流。</p><button type="button" class="button primary" data-action="new-template">${icon('plus')}创建第一个模板</button></div>` + popupFooter('hooky');
    return;
  }
  const busy = hSend.phase === 'sending';
  let result = '';
  if (hSend.phase === 'success') result = `<div class="inline-result" role="status">${icon('check')}演示成功 · HTTP 200 · ${esc(hSend.templateName)}<br>已解析 ${hSend.count} 个参数。请求未实际发出。</div><details class="request-preview" id="h-sent-request"><summary><span>${icon('code')}查看这次请求</span><span class="preview-mode">${hSend.request.mode}</span>${icon('chevron')}</summary><pre>${esc(hSend.request.text)}</pre></details>`;
  if (hSend.phase === 'error') result = `<div class="inline-result error" role="alert">${icon('info')}演示失败 · HTTP 503<br>服务暂不可用，参数已保留，可以重新发送。</div>`;
  const params = template.params.filter(param => param.key.trim());
  $('#h-popup').innerHTML = popupHeader('hooky') + `<div class="popup-body">${pageContext()}
    <div class="template-picker">${icon('link')}<select id="h-popup-template" aria-label="选择发送模板"${disabled(busy)}>${state.hooky.templates.map(item => `<option value="${esc(item.id)}"${selected(item.id,template.id)}>${esc(item.name || '未命名 Webhook')}</option>`).join('')}</select></div>
    <div class="request-destination"><span class="method-badge">${esc(template.method)}</span><span class="url" title="${esc(template.url)}">${esc(template.url || '先在设置中填写请求地址')}</span></div>
    <div class="popup-params">${params.map((param,index) => {
      const value = hOverrides[index] ?? resolveValue(param.value);
      const attrs = `data-popup-param="${index}" aria-label="发送参数 ${esc(param.key)}" title="${esc(param.value)}"${disabled(busy)}`;
      return `<label class="popup-param"><span title="${esc(param.key)}">${esc(param.key)}</span>${value.includes('\n') ? `<textarea rows="2" ${attrs}>${esc(value)}</textarea>` : `<input ${attrs} value="${esc(value)}">`}</label>`;
    }).join('')}</div>
    <button type="button" class="button primary wide popup-primary" id="h-send" data-action="send"${disabled(busy || !validHttpUrl(template.url))}>${icon(busy ? 'reset' : 'send')}<span>${busy ? '正在发送…' : hSend.phase === 'error' ? '重新发送' : '发送到 ' + esc(template.name || 'Webhook')}</span></button>${result}
  </div>` + popupFooter('hooky');
}

function sidebar(app) {
  const hooky = app === 'hooky';
  const page = hooky ? hPage : rPage;
  const items = hooky ? [['templates','link','Webhooks'],['rules','bolt','快捷规则'],['appearance','palette','外观']] : [['connection','cloud','存储连接'],['capture','sliders','截图设置'],['appearance','palette','外观']];
  return `<aside class="sidebar"><div class="sidebar-brand">${brand(app)}</div><div class="sidebar-caption">${hooky ? 'WORKSPACE' : 'PREFERENCES'}</div><nav class="sidebar-nav" aria-label="${hooky ? 'Hooky' : 'R2Shot'} 设置导航">${items.map(([key, glyph, label]) => `<button type="button" class="nav-item${page === key ? ' active' : ''}" data-action="page" data-app="${app}" data-page="${key}"${page === key ? ' aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span>${hooky && key !== 'appearance' ? `<span class="nav-count">${key === 'templates' ? state.hooky.templates.length : state.hooky.rules.length}</span>` : ''}</button>${hooky && key === 'templates' && page === 'templates' ? `<div class="subnav">${state.hooky.templates.map(template => `<button type="button" class="template-nav${template.id === hSelected ? ' active' : ''}" data-action="select-template" data-id="${esc(template.id)}" title="${esc(template.name)}"${template.id === hSelected ? ' aria-current="true"' : ''}><span class="nav-dot"></span><span class="nav-name">${esc(template.name || '未命名 Webhook')}</span></button>`).join('')}<button type="button" class="template-nav template-add" data-action="new-template">${icon('plus')}新建模板</button></div>` : ''}`).join('')}</nav><div class="sidebar-bottom"><span>${icon('lock')}设置保存在本机</span><small>${hooky ? 'v1.1.1' : 'v1.3.1'} / UI CONCEPT</small></div></aside>`;
}

function editorHeader(title, kicker, right = '') {
  return `<header class="editor-header"><div class="editor-title-block"><h3>${esc(title)}</h3><small>${esc(kicker)}</small></div>${right}</header>`;
}

function renderHWorkbench() {
  let content;
  if (hPage === 'appearance') content = appearance('hooky');
  else if (hPage === 'rules') content = rulesEditor();
  else content = templateEditor();
  $('#h-workbench').innerHTML = sidebar('hooky') + `<div class="editor">${content}</div>`;
}

function templateEditor() {
  const draft = draftTemplate();
  if (!draft) return editorHeader('Webhooks','YOUR BROWSER, CONNECTED') + `<div class="editor-scroll"><div class="empty-state">${icon('link')}<h3>从一个模板开始</h3><p>为常用的工作流保存地址与参数。之后在工具栏就能随时调用。</p><button type="button" class="button primary" data-action="new-template">${icon('plus')}新建 Webhook</button></div></div>`;
  const request = requestFor(draft);
  const dirty = templateDirty();
  return editorHeader(draft.name || '未命名 Webhook','WEBHOOK / TEMPLATE',`<span class="status-text${dirty ? ' unsaved' : ''}" data-h-saved><span class="status-dot"></span>${dirty ? '未保存' : '已保存'}</span>`) + `
    <div class="editor-scroll"><form id="h-template-form">
      <label class="field">模板名称<input id="h-name" name="name" data-h-field="name" value="${esc(draft.name)}" placeholder="例如：阅读收件箱" required maxlength="80"></label>
      <div class="field"><label for="h-url" class="field-title">请求地址<span class="optional">Webhook URL</span></label><div class="endpoint-combo"><select id="h-method" data-h-field="method" aria-label="HTTP 请求方法">${['GET','POST','PUT','PATCH','DELETE'].map(method => `<option${selected(method,draft.method)}>${method}</option>`).join('')}</select><input id="h-url" type="url" data-h-field="url" value="${esc(draft.url)}" placeholder="https://hooks.example.com/inbox" required></div></div>
      <div class="section-heading"><h3>请求参数 <span class="badge neutral" id="h-param-count">${draft.params.length}</span></h3><button type="button" class="text-button" data-action="add-param">${icon('plus')}添加参数</button></div>
      <div class="param-table"><div class="param-table-head"><span>KEY</span><span>VALUE / 变量</span><span></span></div>${draft.params.map((param,index) => `<div class="param-row"><input data-param-key="${index}" value="${esc(param.key)}" aria-label="参数 ${index + 1} 的名称" placeholder="key"><input data-param-value="${index}" value="${esc(param.value)}" aria-label="参数 ${index + 1} 的值" placeholder="值或 {{page.url}}"><button type="button" class="icon-button" data-action="remove-param" data-index="${index}" aria-label="移除参数 ${index + 1}" title="移除参数">${icon('close')}</button></div>`).join('')}</div>
      <div class="variable-tray"><span>插入变量</span>${variables.slice(0,3).map(variable => `<button type="button" class="variable-chip" data-action="insert-variable" data-value="${variable}" title="插入 {{${variable}}}">{{${variable}}}</button>`).join('')}<details class="more-variables"><summary title="另外 4 种页面元数据">更多 · 4</summary><div class="extra-chips">${variables.slice(3).map(variable => `<button type="button" class="variable-chip" data-action="insert-variable" data-value="${variable}">{{${variable}}}</button>`).join('')}</div></details></div>
      <details class="request-preview" id="h-request-preview"${previewOpen ? ' open' : ''}><summary><span>${icon('code')}请求预览</span><span class="preview-mode" id="h-preview-mode">${request.mode}</span>${icon('chevron')}</summary><pre id="h-preview-code">${esc(request.text)}</pre></details>
      <div class="mini-caption">${icon('info')}变量使用示例网页解析。GET / DELETE 自动转为查询参数。</div>
      <p class="field-error" id="h-template-error" role="alert"></p>
    </form></div>
    <footer class="editor-footer"><button type="button" class="button danger-quiet" data-action="delete-template" aria-label="删除当前模板">${icon('trash')}删除</button><span class="spacer"></span><span class="status-text" id="h-save-note">${dirty ? '更改待保存' : '已同步到弹窗'}</span><button type="submit" form="h-template-form" class="button primary">保存模板</button></footer>`;
}

function updateTemplatePreview() {
  const draft = draftTemplate();
  if (!draft) return;
  const preview = requestFor(draft);
  if ($('#h-preview-code')) $('#h-preview-code').textContent = preview.text;
  if ($('#h-preview-mode')) $('#h-preview-mode').textContent = preview.mode;
  const dirty = templateDirty();
  const status = $('[data-h-saved]');
  if (status) {
    status.innerHTML = `<span class="status-dot"></span>${dirty ? '未保存' : '已保存'}`;
    status.classList.toggle('unsaved',dirty);
  }
  if ($('#h-save-note')) $('#h-save-note').textContent = dirty ? '更改待保存' : '已同步到弹窗';
  if ($('#h-template-error')) $('#h-template-error').textContent = '';
}

function ruleOptions(value) {
  return state.hooky.templates.map(template => `<option value="${esc(template.id)}"${selected(value,template.id)}>${esc(template.name || '未命名 Webhook')}</option>`).join('');
}

function rulesEditor() {
  const count = state.hooky.rules.filter(rule => rule.enabled).length;
  const header = editorHeader('快捷发送规则','AUTOMATE THE EVERYDAY',`<button type="button" class="button subtle" data-action="add-rule"${disabled(!state.hooky.templates.length)}>${icon('plus')}规则</button>`);
  const cards = state.hooky.rules.map((saved, index) => {
    const rule = draftRule(saved.id);
    const template = state.hooky.templates.find(template => template.id === saved.templateId);
    return `<details class="rule-card" data-rule="${esc(rule.id)}" data-enabled="${saved.enabled}"${openRules.has(rule.id) ? ' open' : ''}><summary><span class="rule-number">${String(index + 1).padStart(2,'0')}</span><span class="rule-summary"><strong>${saved.field === 'url' ? 'URL' : '标题'} ${operators[saved.operator]} ${esc(saved.value || '…')}</strong><small>${icon('arrow')}${esc(template?.name || '选择一个模板')}${saved.enabled ? '' : ' · 已停用'}</small></span>${icon('chevron')}</summary>
      <form class="rule-form" data-rule-form="${esc(rule.id)}"><div class="form-grid"><label class="field">当页面<select data-rule-field="field"><option value="url"${selected(rule.field,'url')}>URL</option><option value="title"${selected(rule.field,'title')}>标题</option></select></label><label class="field">匹配条件<select data-rule-field="operator">${Object.entries(operators).map(([key,label]) => `<option value="${key}"${selected(rule.operator,key)}>${label}</option>`).join('')}</select></label></div><label class="field">匹配内容<input data-rule-field="value" value="${esc(rule.value)}" placeholder="例如：github.com" required></label><label class="field">发送到<select data-rule-field="templateId" required>${ruleOptions(rule.templateId)}</select></label>
      <p class="field-error" data-rule-error role="alert"></p><div class="rule-actions"><label class="rule-enabled"><input type="checkbox" class="switch" data-rule-field="enabled" aria-label="启用规则 ${index + 1}"${checked(rule.enabled)}>启用</label><button type="button" class="icon-button" data-action="move-rule" data-id="${esc(rule.id)}" data-offset="-1" aria-label="规则 ${index + 1} 上移" title="提高优先级"${disabled(index === 0)}>${icon('up')}</button><button type="button" class="icon-button" data-action="move-rule" data-id="${esc(rule.id)}" data-offset="1" aria-label="规则 ${index + 1} 下移" title="降低优先级"${disabled(index === state.hooky.rules.length - 1)}>${icon('down')}</button><button type="button" class="icon-button" data-action="delete-rule" data-id="${esc(rule.id)}" aria-label="删除规则 ${index + 1}" title="删除规则">${icon('trash')}</button><button type="submit" class="button subtle">保存</button></div></form></details>`;
  }).join('');
  const empty = `<div class="empty-state">${icon('bolt')}<h3>让常用操作快一步</h3><p>${state.hooky.templates.length ? '添加规则，点击扩展图标时就能自动选择模板。' : '先创建一个 Webhook 模板，再为它设置匹配规则。'}</p><button type="button" class="button primary" data-action="${state.hooky.templates.length ? 'add-rule' : 'new-template'}">${icon('plus')}${state.hooky.templates.length ? '添加规则' : '创建模板'}</button></div>`;
  return header + `<div class="editor-scroll"><p class="editor-description">点击工具栏图标时，按顺序匹配当前页面。<br>第一条命中即发送；未命中时打开弹窗。</p><div class="rules-list">${cards || empty}</div><section class="rule-tester"><div class="section-heading"><h3>试跑一下</h3><span class="badge neutral">已保存的规则</span></div><label class="field">页面 URL<div class="test-target"><input id="h-rule-url" type="url" value="${esc(state.page.url)}" aria-label="用于规则测试的页面 URL"><button type="button" class="button secondary" data-action="test-rules">检查匹配</button></div></label><p class="rule-hint">${icon('info')}标题规则使用示例网页标题；可在画布顶部修改。</p>${hTest ? `<div class="inline-result${hTest.error ? ' error' : ''}" role="status">${esc(hTest.text)}${hTest.templateId ? `<br><button type="button" class="text-button" data-action="apply-rule" data-id="${esc(hTest.templateId)}">在弹窗中预览 ${icon('arrow')}</button>` : ''}</div>` : ''}</section></div><footer class="editor-footer"><span class="rule-hint">${icon('bolt')}${count} 条规则已启用 · 忽略大小写</span></footer>`;
}

function appearance(app) {
  const theme = state[app].theme;
  const name = app === 'hooky' ? 'Hooky' : 'R2Shot';
  return editorHeader('外观','MAKE IT FEEL AT HOME',`<span class="badge soft">${name}</span>`) + `<div class="editor-scroll"><div class="appearance-content"><p class="editor-description">选择适合你的工作环境。<br>只调整 ${name} 的外观，另一款工具保持自己的设置。</p><div class="theme-options">${[['light','sun','浅色'],['dark','moon','深色'],['system','screen','跟随系统']].map(([value,glyph,label]) => `<label class="theme-option"><input type="radio" name="${app}-theme" value="${value}" data-app-theme="${app}"${checked(theme === value)}><span><span class="theme-mini ${value}-mini"><span class="theme-mini-window"><i></i><span class="theme-mini-body"><i></i><i></i><i></i></span></span></span><span class="theme-choice-label">${icon(glyph)}${label}</span></span></label>`).join('')}</div><p class="theme-caption">切换后立即应用到弹窗和设置页。选择「跟随系统」时，随操作系统自动调整。</p><section class="token-sheet"><h3>${app === 'hooky' ? '紫藤色 · Wisteria' : '海玻璃色 · Sea glass'}</h3><div class="color-swatches"><div><i></i><span>主操作</span></div><div><i></i><span>轻强调</span></div><div><i></i><span>侧栏</span></div><div><i></i><span>正文</span></div></div><div class="theme-component-sample">${icon(app === 'hooky' ? 'send' : 'camera')}<span>${app === 'hooky' ? '让每次发送都清晰' : '让每次捕获都轻松'}<small>细边框、轻阴影、清楚的操作层级</small></span><span class="badge soft">预览</span></div></section></div></div><footer class="editor-footer"><span class="status-text"><span class="status-dot"></span>外观已应用 · 本次演示</span></footer>`;
}

function captureScene(full = rMode, caption = '范围示意') {
  return `<div class="capture-scene" data-full="${full}" role="img" aria-label="${full ? '整页截图' : '可见区域截图'}的示意页面"><div class="sample-window"><div class="sample-window-bar"><i></i><i></i><i></i><span></span></div><div class="sample-page"><span class="sample-kicker">FIELD NOTES / NO. 24</span><h4>A quieter corner<br>of the internet.</h4><div class="sample-lines"><i></i><i></i><i></i><i></i></div><div class="sample-art"></div></div></div><div class="capture-guide"></div><span class="scene-caption">${esc(caption)}</span></div>`;
}

function configured(config = state.r2shot.config) {
  return ['endpoint','accessKeyId','secretAccessKey','bucketName','customDomain'].every(key => String(config[key]).trim());
}

function renderRPopup() {
  const config = state.r2shot.config;
  let body;
  if (!configured()) {
    body = `<div class="empty-state">${icon('cloud')}<h3>给截图一个自己的家</h3><p>连接你的 R2 存储桶，就能把网页截图变成可以分享的链接。</p><button type="button" class="button primary" data-action="navigate" data-app="r2shot" data-page="connection">${icon('plus')}连接存储空间</button></div>`;
  } else if (rCapture.phase === 'capturing' || rCapture.phase === 'uploading') {
    const capturing = rCapture.phase === 'capturing';
    body = `<div class="popup-body">${pageContext()}${captureScene()}<div class="capture-processing" role="status"><span class="progress-mark">${icon(capturing ? 'camera' : 'cloud')}</span><h3>${capturing ? '正在生成截图示例…' : '正在模拟上传…'}</h3><p>${capturing ? (rMode ? '按当前视口宽度拼接页面' : '捕获当前可见区域') : '上传到 ' + esc(config.bucketName)}</p><div class="progress-track"><span></span></div></div></div>`;
  } else if (rCapture.phase === 'success') {
    body = `<div class="popup-body"><div class="capture-success-heading">${icon('check')}<div><h3>截图已就绪</h3><small>上传成功状态演示 · ${esc(rCapture.bucket)}</small></div><span class="badge soft">演示</span></div>${captureScene(rCapture.full,rCapture.full ? '整页结果示意' : '可见区域结果示意')}<div class="capture-meta"><span>${rCapture.full ? '完整长页' : '可见区域'}</span><span class="mono">JPG · ${rCapture.quality}%</span></div><div class="capture-link" id="r-result-link" tabindex="0" aria-label="生成的演示图片链接">${esc(rCapture.url)}</div><div class="capture-actions"><button type="button" class="button primary" data-action="copy-url">${icon('copy')}复制链接</button><button type="button" class="button secondary" data-action="new-capture" aria-label="开始新的截图">${icon('reset')}再截一张</button></div></div>`;
  } else if (rCapture.phase === 'error') {
    body = `<div class="popup-body">${pageContext()}<div class="capture-error" role="alert">${icon('info')}<h3>这次没有上传成功</h3><p>演示错误：AccessDenied · 403<br>检查存储桶和访问密钥，然后重新尝试。</p></div><div class="capture-actions"><button type="button" class="button primary" data-action="capture">${icon('reset')}重新尝试</button><button type="button" class="button secondary" data-action="navigate" data-app="r2shot" data-page="connection">检查连接</button></div></div>`;
  } else {
    body = `<div class="popup-body">${pageContext()}<div class="segmented capture-modes" aria-label="截图范围"><button type="button" data-action="capture-mode" data-value="visible" aria-pressed="${!rMode}">${icon('screen')}可见区域</button><button type="button" data-action="capture-mode" data-value="full" aria-pressed="${rMode}">${icon('scan')}整页截图</button></div>${captureScene()}<div class="capture-meta"><span>${rMode ? `自动拼接 · 最多 ${config.maxScreens} 屏` : '只截取屏幕上看见的部分'}</span><button type="button" class="text-button" data-action="navigate" data-app="r2shot" data-page="capture">JPG · ${config.jpgQuality}% ${icon('chevron')}</button></div><div class="storage-destination">${icon('folder')}<span title="${esc(config.bucketName)}">${esc(config.bucketName)}</span><small><span class="status-dot"></span>已配置</small></div><button type="button" class="button primary wide popup-primary" data-action="capture">${icon('camera')}截图并上传</button></div>`;
  }
  $('#r-popup').innerHTML = popupHeader('r2shot') + body + popupFooter('r2shot');
}

function renderRWorkbench() {
  $('#r-workbench').innerHTML = sidebar('r2shot') + `<div class="editor">${rPage === 'appearance' ? appearance('r2shot') : rPage === 'capture' ? captureSettings() : connectionSettings()}</div>`;
}

function rFooter() {
  return `<footer class="editor-footer"><button type="button" class="button secondary" data-action="test-connection"${disabled(rConnection.phase === 'testing')}>${icon(rConnection.phase === 'testing' ? 'reset' : 'bolt')}${rConnection.phase === 'testing' ? '测试中…' : '测试连接'}</button><span class="spacer"></span><span class="status-text" id="r-save-note">${rDirty() ? '未保存' : '已保存'}</span><button type="submit" form="r-config-form" class="button primary">保存设置</button></footer>`;
}

function connectionStatus() {
  if (rConnection.phase === 'success') return `<div class="inline-result" role="status">${icon('check')}演示连接成功 · 存储桶可访问。<br>公开域名需通过实际图片链接确认。</div>`;
  if (rConnection.phase === 'error') return `<div class="inline-result error" role="alert">${icon('info')}演示连接失败 · AccessDenied<br>请检查访问密钥是否有权访问此存储桶。</div>`;
  return '';
}

function connectionSettings() {
  return editorHeader('存储连接','YOUR CAPTURES, YOUR STORAGE',`<span class="badge soft">${icon('cloud')}Cloudflare R2</span>`) + `<div class="editor-scroll"><form id="r-config-form"><div class="config-intro"><span class="config-icon">${icon('cloud')}</span><div><strong>连接你的 R2</strong><p>截图直接上传到自己的存储空间。</p></div></div>
    <label class="field"><span class="field-title">Endpoint URL<span class="optional">S3 API</span></span><input id="r-endpoint" data-r-field="endpoint" type="url" value="${esc(rDraft.endpoint)}" placeholder="https://account.r2.cloudflarestorage.com/bucket" required><small id="r-endpoint-help">粘贴包含存储桶的完整地址，可自动拆分。</small></label>
    <div class="form-grid"><label class="field">Access Key ID<input id="r-access" data-r-field="accessKeyId" value="${esc(rDraft.accessKeyId)}" autocomplete="off" spellcheck="false" required></label><label class="field" for="r-secret">Secret Access Key<span class="password-field"><input id="r-secret" data-r-field="secretAccessKey" type="password" value="${esc(rDraft.secretAccessKey)}" autocomplete="off" required><button type="button" class="icon-button" data-action="show-secret" aria-label="显示访问密钥" aria-pressed="false" title="显示访问密钥">${icon('eye')}</button></span></label></div>
    <div class="form-grid"><label class="field">存储桶名称<input id="r-bucket" data-r-field="bucketName" value="${esc(rDraft.bucketName)}" placeholder="my-screenshots" required></label><label class="field">公开域名<input id="r-domain" data-r-field="customDomain" value="${esc(rDraft.customDomain)}" placeholder="images.example.com" required></label></div>
    <div class="url-output">${icon('link')}<div><strong>分享链接会长这样</strong><code id="r-url-preview">https://${esc(rDraft.customDomain || 'images.example.com')}/${new Date().toISOString().slice(0,10)}/&lt;uuid&gt;.jpg</code></div></div><p class="mini-caption">${icon('lock')}演示字段可编辑。保存只影响当前概念稿。</p><p class="field-error" id="r-config-error" role="alert"></p><div id="r-connection-result">${connectionStatus()}</div></form></div>` + rFooter();
}

function captureSettings() {
  return editorHeader('截图设置','SMALL FILES, CLEAR DETAILS',`<span class="badge soft">JPEG</span>`) + `<div class="editor-scroll"><form id="r-config-form"><p class="editor-description">为日常分享找到清晰度与体积的平衡。</p><section class="preference-section"><label class="preference-title" for="r-quality-number">${icon('sliders')}JPEG 质量</label><div class="range-control"><input type="range" min="1" max="100" step="1" id="r-quality-range" data-r-field="jpgQuality" value="${esc(rDraft.jpgQuality)}" aria-label="JPEG 质量滑块"><input type="number" min="1" max="100" step="1" id="r-quality-number" data-r-field="jpgQuality" value="${esc(rDraft.jpgQuality)}" aria-label="JPEG 质量数值" required></div><div class="range-labels"><span>文件更小</span><span>细节更多</span></div><p>所有截图以 JPEG 上传。默认 90，取值 1–100。</p></section><section class="preference-section"><label class="preference-title" for="r-max-screens">${icon('scan')}整页截图上限</label><div class="screen-limit"><input id="r-max-screens" data-r-field="maxScreens" type="number" min="1" max="100" step="1" value="${esc(rDraft.maxScreens)}" required><span>个视口高度</span></div><p>自动滚动并拼接已加载内容。取值 1–100；达到上限即停止。</p></section><div class="capture-preview-box"><div class="section-heading"><h3>输出方式</h3><span class="badge neutral" id="r-quality-summary">JPEG · ${esc(rDraft.jpgQuality)}%</span></div><div class="storage-path" id="r-height-summary">保持当前视口宽度 · 高度最多 ${esc(rDraft.maxScreens)} 屏</div><p class="mini-caption">${icon('info')}整页截图完成后，尝试恢复原来的滚动位置。</p></div><p class="field-error" id="r-config-error" role="alert"></p><div id="r-connection-result">${connectionStatus()}</div></form></div>` + rFooter();
}

function applyThemes() {
  for (const app of ['hooky','r2shot']) {
    const theme = state[app].theme;
    $(`#study-${app}`).dataset.theme = theme === 'system' ? (systemTheme.matches ? 'dark' : 'light') : theme;
  }
}

function renderAll() {
  renderHPopup(); renderHWorkbench(); renderRPopup(); renderRWorkbench(); applyThemes();
}

function scrollToSurface(app, popup = false) {
  const id = popup ? (app === 'hooky' ? 'h-popup' : 'r-popup') : (app === 'hooky' ? 'h-settings-section' : 'r-settings-section');
  document.getElementById(id).scrollIntoView({block:'start', behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
}

function setView(value) {
  document.documentElement.dataset.view = value;
  $$('[data-action="view"]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.value === value)));
}

function navigate(app, page, scroll = false) {
  if (document.documentElement.dataset.view !== 'both' && document.documentElement.dataset.view !== app) setView(app);
  if (app === 'hooky') { hPage = page; renderHWorkbench(); }
  else { rPage = page; renderRWorkbench(); }
  if (scroll) scrollToSurface(app);
}

function confirmAction(title, description, action, label = '确认删除') {
  pendingConfirm = action;
  $('#confirm-title').textContent = title;
  $('#confirm-description').textContent = description;
  $('#confirm-action').textContent = label;
  $('#confirm-dialog').showModal();
}

function resetHResult() { hGeneration++; hSend = {phase:'idle'}; hOverrides = []; }

function selectTemplate(id) {
  if (!state.hooky.templates.some(template => template.id === id)) return;
  hSelected = id;
  state.hooky.activeId = id;
  hPage = 'templates';
  lastParam = 0;
  resetHResult();
  renderHWorkbench(); renderHPopup();
}

function newTemplate() {
  if ($('#h-scenario').value === 'empty') $('#h-scenario').value = 'success';
  const template = {id:uid(),name:'新的 Webhook',url:'',method:'POST',params:[{key:'url',value:'{{page.url}}'},{key:'title',value:'{{page.title}}'}]};
  state.hooky.templates.push(template);
  selectTemplate(template.id);
  if (document.documentElement.dataset.view === 'r2shot') setView('hooky');
  scrollToSurface('hooky');
  $('#h-name').focus({preventScroll:true}); $('#h-name').select();
}

function saveTemplate(form) {
  if (!form.reportValidity()) return;
  const draft = draftTemplate();
  if (!draft.name.trim() || !validHttpUrl(draft.url)) {
    $('#h-template-error').textContent = '请填写模板名称，以及以 https:// 或 http:// 开头的有效地址。';
    return;
  }
  const saved = clone(draft);
  saved.name = saved.name.trim(); saved.url = saved.url.trim();
  saved.params = saved.params.map(param => ({key:param.key.trim(),value:param.value}));
  state.hooky.templates[state.hooky.templates.findIndex(template => template.id === saved.id)] = saved;
  hDrafts.set(saved.id,clone(saved));
  hTest = null;
  resetHResult();
  renderHWorkbench(); renderHPopup();
  toast('模板已保存，工具栏弹窗已同步。');
}

function deleteTemplate() {
  const template = state.hooky.templates.find(template => template.id === hSelected);
  if (!template) return;
  confirmAction('删除这个模板？',`「${template.name}」会从本次演示中移除；引用它的快捷规则也会一并移除。`,() => {
    state.hooky.templates = state.hooky.templates.filter(item => item.id !== template.id);
    state.hooky.rules = state.hooky.rules.filter(rule => rule.templateId !== template.id);
    hDrafts.delete(template.id);
    hSelected = state.hooky.templates[0]?.id || null;
    state.hooky.activeId = hSelected;
    hTest = null; resetHResult(); renderHWorkbench(); renderHPopup();
    toast('模板已移除。');
  });
}

async function sendWebhook() {
  if (hSend.phase === 'sending') return;
  const template = state.hooky.templates.find(template => template.id === state.hooky.activeId) || state.hooky.templates[0];
  if (!template || !validHttpUrl(template.url)) return;
  hOverrides = $$('[data-popup-param]').map(input => input.value);
  const params = template.params.filter(param => param.key.trim()).map((param,index) => ({key:param.key,value:hOverrides[index]}));
  const request = requestFor(template,params,false);
  const fail = $('#h-scenario').value === 'error';
  const generation = ++hGeneration;
  hSend = {phase:'sending'}; renderHPopup();
  await sleep(600);
  if (generation !== hGeneration) return;
  hSend = {phase:fail ? 'error' : 'success',templateName:template.name,count:params.length,request};
  renderHPopup();
}

function addRule() {
  if (!state.hooky.templates.length) return;
  const rule = {id:uid(),field:'url',operator:'contains',value:'',templateId:state.hooky.templates[0].id,enabled:true};
  state.hooky.rules.push(rule);
  openRules.add(rule.id); hPage = 'rules'; hTest = null;
  renderHWorkbench();
  const input = $(`[data-rule-form="${rule.id}"] [data-rule-field="value"]`);
  input.focus();
}

function saveRule(form) {
  if (!form.reportValidity()) return;
  const draft = draftRule(form.dataset.ruleForm);
  const error = $('[data-rule-error]',form);
  if (!draft.value.trim()) { error.textContent = '请填写匹配内容。'; return; }
  if (draft.operator === 'matches') {
    try { new RegExp(draft.value,'i'); }
    catch { error.textContent = '正则表达式无效，请检查括号和转义。'; return; }
  }
  if (!state.hooky.templates.some(template => template.id === draft.templateId)) { error.textContent = '请选择一个有效模板。'; return; }
  state.hooky.rules[state.hooky.rules.findIndex(rule => rule.id === draft.id)] = clone(draft);
  hTest = null; renderHWorkbench(); toast('规则已保存。');
}

function testRules() {
  const input = $('#h-rule-url');
  if (!input.reportValidity() || !validHttpUrl(input.value)) { toast('请输入有效的网页 URL。'); return; }
  state.page.url = input.value.trim();
  const match = findRule();
  if (match?.template) {
    hTest = {text:`第 ${state.hooky.rules.indexOf(match.rule) + 1} 条规则命中 → ${match.template.name}`,templateId:match.template.id};
  } else {
    hTest = {text:match ? '规则已命中，但目标模板未配置有效地址。将打开弹窗。' : '没有规则命中。将打开弹窗，由你手动选择模板。'};
  }
  resetHResult(); renderHWorkbench(); renderHPopup(); renderRPopup();
}

function normalizeRConfig() {
  rDraft.endpoint = rDraft.endpoint.trim();
  rDraft.accessKeyId = rDraft.accessKeyId.trim();
  rDraft.secretAccessKey = rDraft.secretAccessKey.trim();
  rDraft.bucketName = rDraft.bucketName.trim();
  rDraft.customDomain = rDraft.customDomain.trim().replace(/^https:\/\//i,'').replace(/\/+$/,'');
}

function rConfigError() {
  if (!configured(rDraft)) return '请在「存储连接」中完整填写 Endpoint、访问密钥、存储桶与公开域名。';
  try { if (new URL(rDraft.endpoint).protocol !== 'https:') return 'Endpoint 必须使用 HTTPS。'; }
  catch { return '请填写有效的 Endpoint URL。'; }
  try {
    const domain = new URL('https://' + rDraft.customDomain);
    if (domain.pathname !== '/' || domain.search || domain.hash || domain.username || domain.password || !domain.hostname.includes('.')) return '公开域名应为域名本身，例如 images.example.com。';
  } catch { return '请填写有效的公开域名。'; }
  if (!Number.isInteger(rDraft.jpgQuality) || rDraft.jpgQuality < 1 || rDraft.jpgQuality > 100) return 'JPEG 质量必须是 1–100 之间的整数。';
  if (!Number.isInteger(rDraft.maxScreens) || rDraft.maxScreens < 1 || rDraft.maxScreens > 100) return '整页截图上限必须是 1–100 之间的整数。';
  return '';
}

function showRConfigError(message) {
  const target = $('#r-config-error');
  if (target) { target.textContent = message; target.scrollIntoView({block:'nearest'}); }
  else toast(message);
}

function saveRConfig(form) {
  if (!form.reportValidity()) return;
  normalizeRConfig();
  const error = rConfigError();
  if (error) { showRConfigError(error); return; }
  state.r2shot.config = clone(rDraft);
  if ($('#r-scenario').value === 'empty') $('#r-scenario').value = 'success';
  renderRWorkbench(); renderRPopup();
  toast('设置已保存，截图弹窗已同步。');
}

function updateRDirty() {
  if ($('#r-save-note')) $('#r-save-note').textContent = rDirty() ? '未保存' : '已保存';
  if ($('#r-config-error')) $('#r-config-error').textContent = '';
  if ($('#r-url-preview')) $('#r-url-preview').textContent = `https://${rDraft.customDomain || 'images.example.com'}/${new Date().toISOString().slice(0,10)}/<uuid>.jpg`;
  if ($('#r-quality-summary')) $('#r-quality-summary').textContent = `JPEG · ${rDraft.jpgQuality}%`;
  if ($('#r-height-summary')) $('#r-height-summary').textContent = `保持当前视口宽度 · 高度最多 ${rDraft.maxScreens} 屏`;
  connectionGeneration++;
  if (rConnection.phase !== 'idle') {
    rConnection = {phase:'idle'};
    if ($('#r-connection-result')) $('#r-connection-result').innerHTML = '';
    const button = $('[data-action="test-connection"]');
    if (button) { button.disabled = false; button.innerHTML = icon('bolt') + '测试连接'; }
  }
}

async function testConnection() {
  if (rConnection.phase === 'testing') return;
  normalizeRConfig();
  const error = rConfigError();
  if (error) { showRConfigError(error); return; }
  const fail = $('#r-scenario').value === 'error';
  const generation = ++connectionGeneration;
  rConnection = {phase:'testing'}; renderRWorkbench();
  await sleep(700);
  if (generation !== connectionGeneration) return;
  rConnection = {phase:fail ? 'error' : 'success'}; renderRWorkbench();
}

async function capture() {
  if (!configured() || ['capturing','uploading'].includes(rCapture.phase)) return;
  const generation = ++rGeneration;
  const config = clone(state.r2shot.config);
  const full = rMode;
  const fail = $('#r-scenario').value === 'error';
  rCapture = {phase:'capturing'}; renderRPopup();
  await sleep(450);
  if (generation !== rGeneration) return;
  rCapture = {phase:'uploading'}; renderRPopup();
  await sleep(550);
  if (generation !== rGeneration) return;
  const url = `https://${config.customDomain}/${new Date().toISOString().slice(0,10)}/${uid()}.jpg`;
  rCapture = {phase:fail ? 'error' : 'success',url,full,bucket:config.bucketName,quality:config.jpgQuality};
  renderRPopup();
}

async function copyUrl() {
  if (rCapture.phase !== 'success') return;
  const url = rCapture.url;
  const active = document.activeElement;
  let copied = false;
  try { await navigator.clipboard.writeText(url); copied = true; }
  catch {
    // file:// clipboard access varies with Chrome permissions; the native fallback is local.
    const input = document.createElement('textarea');
    input.className = 'clipboard-helper'; input.value = url;
    document.body.append(input); input.select();
    try { copied = document.execCommand('copy'); } catch { copied = false; }
    input.remove(); active?.focus({preventScroll:true});
  }
  if (copied) toast('示例图片链接已复制。');
  else {
    const target = $('#r-result-link');
    if (target) {
      const range = document.createRange(); range.selectNodeContents(target);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    }
    toast('链接已选中，请按 ⌘C / Ctrl+C 复制。');
  }
}

function openContext() {
  const form = $('#context-form');
  for (const name of ['url','title','selection']) form.elements.namedItem(name).value = state.page[name];
  form.elements.namedItem('description').value = state.page.meta.description;
  for (const name of ['og:title','og:description','og:image']) form.elements.namedItem(name).value = state.page.meta[name];
  $('#context-dialog').showModal();
  form.elements.namedItem('url').focus();
}

function resetDemo() {
  state = clone(initial);
  state.hooky.theme = state.r2shot.theme = document.documentElement.dataset.canvas;
  hPage = 'templates'; hSelected = 'inbox'; hDrafts.clear(); ruleDrafts.clear();
  openRules = new Set(['reading-rule']); hTest = null; lastParam = 0;
  rPage = 'connection'; rDraft = clone(state.r2shot.config); rMode = false;
  rCapture = {phase:'idle'}; rConnection = {phase:'idle'};
  rGeneration++; connectionGeneration++; resetHResult();
  $('#h-scenario').value = 'success'; $('#r-scenario').value = 'success';
  renderAll(); toast('示例数据已恢复。');
}

document.addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  const data = button.dataset;
  switch (data.action) {
    case 'view': setView(data.value); window.scrollTo({top:0,behavior:'instant'}); break;
    case 'direction':
      document.documentElement.dataset.direction = data.value;
      $$('[data-action="direction"]').forEach(item => item.setAttribute('aria-pressed',String(item.dataset.value === data.value)));
      break;
    case 'density': {
      const compact = document.documentElement.dataset.density !== 'compact';
      document.documentElement.dataset.density = compact ? 'compact' : 'comfortable';
      button.setAttribute('aria-pressed',String(compact));
      $('#density-label').textContent = compact ? '紧凑' : '舒适';
      break;
    }
    case 'canvas-theme': {
      const theme = document.documentElement.dataset.canvas === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.canvas = theme;
      state.hooky.theme = theme; state.r2shot.theme = theme; applyThemes();
      button.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
      button.setAttribute('aria-label',`切换全部应用为${theme === 'dark' ? '浅' : '深'}色`);
      if (hPage === 'appearance') renderHWorkbench();
      if (rPage === 'appearance') renderRWorkbench();
      break;
    }
    case 'about': $('#about-dialog').showModal(); break;
    case 'context': openContext(); break;
    case 'close-dialog': button.closest('dialog').close(); break;
    case 'reset': confirmAction('恢复示例数据？','本页的模板、规则、连接配置和截图结果会恢复为初始示例。',resetDemo,'恢复示例'); break;
    case 'page': navigate(data.app,data.page); break;
    case 'navigate': navigate(data.app,data.page,true); break;
    case 'expand': setView(data.app); scrollToSurface(data.app); break;
    case 'select-template': selectTemplate(data.id); break;
    case 'new-template': newTemplate(); break;
    case 'delete-template': deleteTemplate(); break;
    case 'add-param': {
      const draft = draftTemplate(); if (!draft) break;
      draft.params.push({key:'',value:''}); lastParam = draft.params.length - 1;
      renderHWorkbench(); $(`[data-param-key="${lastParam}"]`).focus();
      break;
    }
    case 'remove-param': {
      const draft = draftTemplate(); if (!draft) break;
      draft.params.splice(Number(data.index),1); lastParam = Math.max(0,lastParam - 1);
      renderHWorkbench(); break;
    }
    case 'insert-variable': {
      const draft = draftTemplate(); if (!draft) break;
      if (!draft.params.length) { draft.params.push({key:'value',value:''}); lastParam = 0; renderHWorkbench(); }
      lastParam = Math.min(lastParam,draft.params.length - 1);
      const input = $(`[data-param-value="${lastParam}"]`);
      input.setRangeText(`{{${data.value}}}`,input.selectionStart ?? input.value.length,input.selectionEnd ?? input.value.length,'end');
      draft.params[lastParam].value = input.value; input.focus({preventScroll:true}); updateTemplatePreview(); break;
    }
    case 'send': await sendWebhook(); break;
    case 'add-rule': addRule(); break;
    case 'delete-rule': confirmAction('删除这条规则？','移除后，工具栏会按剩余规则的顺序继续匹配。',() => {
      state.hooky.rules = state.hooky.rules.filter(rule => rule.id !== data.id);
      ruleDrafts.delete(data.id); openRules.delete(data.id); hTest = null; renderHWorkbench(); toast('规则已移除。');
    }); break;
    case 'move-rule': {
      const index = state.hooky.rules.findIndex(rule => rule.id === data.id);
      const next = index + Number(data.offset);
      if (index < 0 || next < 0 || next >= state.hooky.rules.length) break;
      [state.hooky.rules[index],state.hooky.rules[next]] = [state.hooky.rules[next],state.hooky.rules[index]];
      hTest = null; renderHWorkbench(); toast('规则顺序已更新。'); break;
    }
    case 'test-rules': testRules(); break;
    case 'apply-rule': selectTemplate(data.id); scrollToSurface('hooky',true); break;
    case 'capture-mode': rMode = data.value === 'full'; renderRPopup(); break;
    case 'capture': await capture(); break;
    case 'new-capture': rGeneration++; rCapture = {phase:'idle'}; renderRPopup(); break;
    case 'copy-url': await copyUrl(); break;
    case 'test-connection': await testConnection(); break;
    case 'show-secret': {
      const input = $('#r-secret'); const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      button.setAttribute('aria-pressed',String(reveal));
      button.setAttribute('aria-label',reveal ? '隐藏访问密钥' : '显示访问密钥');
      button.title = reveal ? '隐藏访问密钥' : '显示访问密钥'; break;
    }
  }
});

document.addEventListener('input', event => {
  const input = event.target;
  const data = input.dataset;
  if (data.hField) { draftTemplate()[data.hField] = input.value; updateTemplatePreview(); }
  else if (data.paramKey !== undefined || data.paramValue !== undefined) {
    const index = Number(data.paramKey ?? data.paramValue);
    draftTemplate().params[index][data.paramKey !== undefined ? 'key' : 'value'] = input.value;
    updateTemplatePreview();
  } else if (data.popupParam !== undefined) hOverrides[Number(data.popupParam)] = input.value;
  else if (data.ruleField) {
    const form = input.closest('[data-rule-form]');
    draftRule(form.dataset.ruleForm)[data.ruleField] = input.type === 'checkbox' ? input.checked : input.value;
    $('[data-rule-error]',form).textContent = '';
    $('button[type="submit"]',form).textContent = '保存';
  } else if (data.rField) {
    const number = ['jpgQuality','maxScreens'].includes(data.rField);
    rDraft[data.rField] = number && input.value !== '' ? Number(input.value) : input.value;
    if (data.rField === 'jpgQuality') {
      const other = $(input.id === 'r-quality-range' ? '#r-quality-number' : '#r-quality-range');
      if (other) other.value = input.value;
    }
    updateRDirty();
  }
});

document.addEventListener('change', event => {
  const input = event.target;
  if (input.id === 'h-popup-template') selectTemplate(input.value);
  else if (input.dataset.appTheme) { state[input.dataset.appTheme].theme = input.value; applyThemes(); }
  else if (input.id === 'r-endpoint') {
    try {
      const url = new URL(input.value.trim());
      const bucket = url.pathname.split('/').filter(Boolean)[0];
      if (url.protocol !== 'https:') return;
      rDraft.endpoint = url.origin; input.value = url.origin;
      if (bucket) {
        rDraft.bucketName = decodeURIComponent(bucket); $('#r-bucket').value = rDraft.bucketName;
        $('#r-endpoint-help').textContent = `已识别存储桶：${rDraft.bucketName}`;
      }
      updateRDirty();
    } catch { /* Keep incomplete input editable; validation happens on save. */ }
  } else if (input.id === 'h-scenario') {
    if (input.value === 'empty') {
      state.hooky.templates = []; state.hooky.rules = []; state.hooky.activeId = null;
      hSelected = null; hDrafts.clear(); ruleDrafts.clear(); hPage = 'templates'; hTest = null;
    } else if (!state.hooky.templates.length) {
      const theme = state.hooky.theme;
      state.hooky = clone(initial.hooky); state.hooky.theme = theme;
      hSelected = state.hooky.activeId; hPage = 'templates';
    }
    resetHResult(); renderHPopup(); renderHWorkbench();
  } else if (input.id === 'r-scenario') {
    if (input.value === 'empty') {
      for (const key of ['endpoint','accessKeyId','secretAccessKey','bucketName','customDomain']) state.r2shot.config[key] = '';
      rDraft = clone(state.r2shot.config); rPage = 'connection';
    } else if (!configured()) {
      state.r2shot.config = clone(initial.r2shot.config); rDraft = clone(state.r2shot.config);
    }
    rGeneration++; connectionGeneration++; rCapture = {phase:'idle'}; rConnection = {phase:'idle'};
    renderRPopup(); renderRWorkbench();
  }
});

document.addEventListener('focusin', event => {
  if (event.target.dataset.paramValue !== undefined) lastParam = Number(event.target.dataset.paramValue);
});

document.addEventListener('toggle', event => {
  if (!event.target.isConnected) return;
  if (event.target.id === 'h-request-preview') previewOpen = event.target.open;
  if (event.target.matches('details[data-rule]')) {
    if (event.target.open) openRules.add(event.target.dataset.rule);
    else openRules.delete(event.target.dataset.rule);
  }
},true);

document.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  if (form.id === 'h-template-form') saveTemplate(form);
  else if (form.dataset.ruleForm) saveRule(form);
  else if (form.id === 'r-config-form') saveRConfig(form);
  else if (form.id === 'context-form') {
    const values = new FormData(form);
    if (!validHttpUrl(values.get('url'))) { toast('示例网页地址需要以 http:// 或 https:// 开头。'); return; }
    for (const key of ['url','title','selection']) state.page[key] = values.get(key);
    for (const key of ['description','og:title','og:description','og:image']) state.page.meta[key] = values.get(key);
    hTest = null; resetHResult();
    $('#context-dialog').close(); renderHPopup(); renderHWorkbench(); renderRPopup();
    toast('示例网页已更新，两个工具的上下文已同步。');
  }
});

$('#confirm-action').addEventListener('click', () => {
  const action = pendingConfirm; pendingConfirm = null;
  $('#confirm-dialog').close(); action?.();
});
$('#confirm-dialog').addEventListener('close', () => { pendingConfirm = null; });
systemTheme.addEventListener('change',applyThemes);
renderAll();
