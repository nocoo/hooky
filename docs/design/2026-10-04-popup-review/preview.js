const query = new URLSearchParams(location.search);
const proposal = document.body.dataset.variant === "proposal";
let state = query.get("state") || "ready";
const initialState = state;
let templateName = "Reading list";
let settingsNote = false;
let sendTimer;
const capture = {
  url: "https://github.com/cloudflare/agents/",
  note: "cloudflare/agents: Build and deploy AI Agents on Cloudflare",
};
const endpoint = "https://example.invalid/api/link/create/demo";
const longValues = Array.from({ length: 9 }, (_, index) => ({ key: `field_${index + 1}`, value: "Captured page context stays editable.\nA second line of page information.\nNothing leaves this preview." }));
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const icon = (name, extra = "") => `<svg class="icon ${extra}" aria-hidden="true"><use href="#${name}"/></svg>`;
const brand = (settings = true) => `<div class="brand-row"><div class="brand"><img src="assets/icon64.png" width="26" height="26" alt=""><strong>Hooky</strong></div>${settings ? `<button type="button" class="icon-button" data-action="settings" title="Settings" aria-label="Settings">${icon("settings")}</button>` : ""}</div>`;

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
}
applyTheme(query.get("theme"));
window.addEventListener("message", (event) => {
  if (event.source === parent && event.data?.type === "hooky-review-theme") applyTheme(event.data.theme);
});

function requestText() {
  return `POST ${endpoint}\nAuthorization: ••••\nContent-Type: application/json\n\n${JSON.stringify(capture, null, 2)}`;
}

function requestDetails(open = false, repeat = false) {
  return `<details class="disclosure request-details" ${open ? "open" : ""}><summary>${icon("chevron")}<span>${repeat ? "Review captured request" : "Request details"}</span></summary><div class="preview"><p class="detail-label">${repeat ? "Retained capture · available briefly" : "Current page"}</p><p>cloudflare/agents · github.com</p><p class="detail-label">Request · headers masked</p><pre data-request>${escapeHTML(requestText())}</pre><p class="detail-label">${repeat ? "A repeat uses a new send ID. The receiver controls idempotency." : "Edits apply to this send only. Saved templates stay unchanged."}</p></div></details>`;
}

const feedbackData = {
  sending: ["pending", "spinner", "Waiting for the receiver", "", "No response yet. Keep this window open to watch the result."],
  success: ["success", "check", "Receiver responded", "HTTP 201", ""],
  receipt: ["success", "check", "Receiver responded", "HTTP 201", ""],
  accepted: ["warning", "alert", "Accepted for processing", "HTTP 202", "The receiver may still be working. This is not a completion receipt."],
  failed: ["error", "alert", "Authorization required", "HTTP 401", "Check this webhook's credentials in settings before sending again."],
  unknown: ["warning", "alert", "Result unconfirmed", "", "The request may have arrived. Check the receiver before sending again."],
};

function feedback() {
  const entry = feedbackData[state];
  if (!entry) return "";
  const [tone, symbol, title, code, message] = entry;
  return `<section class="feedback" data-tone="${tone}" role="status" aria-live="polite"><div class="feedback-heading">${icon(symbol, state === "sending" ? "spin" : "")}<strong>${title}</strong><span class="code">${code}</span></div>${message ? `<p class="feedback-message">${message}</p>` : ""}${state === "failed" ? '<button type="button" class="quiet-button" data-action="settings">Open settings</button>' : ""}${state !== "sending" ? `<details class="disclosure" ${state === "receipt" ? "open" : ""}><summary>${icon("chevron")}<span class="feedback-meta"><span>${state === "receipt" ? "Response / receipt" : "Send details"}</span><span>${escapeHTML(templateName)}</span><time>06:00</time></span></summary><div class="preview"><dl><dt>HTTP response</dt><dd>${code || "Not received"}</dd><dt>Send ID</dt><dd>8a0f…6d24</dd>${["success", "receipt"].includes(state) ? '<dt>Receipt ID</dt><dd>link-1042</dd><dt>Message</dt><dd>Link added to your list</dd>' : ""}</dl>${state === "receipt" ? '<pre>{"saved":true,"id":"link-1042"}</pre>' : ""}</div></details>` : ""}</section>`;
}

function renderProposal() {
  const root = document.getElementById("proposal");
  root.dataset.state = state;
  if (state === "empty" || state === "load-error") {
    const failed = state === "load-error";
    root.innerHTML = `<main class="task">${brand(false)}<h1 class="task-title">${failed ? icon("alert") : ""}${failed ? "Couldn't open the panel" : "Add your first webhook"}</h1><p>${failed ? "The panel couldn't finish loading. Try again, or reload the extension if this continues." : "Choose a destination and the page details to send. Your setup stays in this browser."}</p><button type="button" class="primary" data-action="${failed ? "reload" : "setup"}"><span>${failed ? "Try again" : "Set up a webhook"}</span>${icon("chevron")}</button></main>`;
    return;
  }
  if (state === "duplicate") {
    root.innerHTML = `<main class="repeat-task">${brand()}<div class="feedback" data-tone="warning"><div class="feedback-heading">${icon("alert")}<strong>This capture was already sent</strong></div><p class="feedback-message">No new request was sent. Review the earlier result before choosing to send it again.</p></div><div class="repeat-info"><strong>${escapeHTML(templateName)}</strong><span>HTTP 201 · 06:00</span></div>${requestDetails(false, true)}<button type="button" class="primary" data-action="send-anyway">${icon("send")}<span>Send anyway</span></button><button type="button" class="quiet-button reset-link" data-action="back">Back to capture</button></main>`;
    return;
  }
  const busy = state === "sending";
  const params = [...Object.entries(capture).map(([key, value]) => ({ key, value })), ...(state === "long" ? longValues : [])];
  const invalid = state === "invalid";
  root.innerHTML = `<main class="editor">${brand()}${settingsNote ? '<p class="settings-note" role="status">Preview only: this action opens the existing settings page in the product. No settings were changed.</p>' : ""}<label class="template-label" for="template">Send to</label><div class="template-control"><span class="method">POST</span><select id="template" ${busy ? "disabled" : ""}><option ${templateName === "Reading list" ? "selected" : ""}>Reading list</option><option ${templateName === "Team inbox" ? "selected" : ""}>Team inbox</option></select>${icon("chevron")}</div><div class="params">${params.map(({ key, value }, index) => `<div class="param"><label for="field-${index}">${key}</label><textarea id="field-${index}" rows="1" data-field="${key}" ${busy ? "disabled" : ""}>${escapeHTML(value)}</textarea></div>`).join("")}</div>${invalid ? `<div class="error-box" role="alert"><div class="feedback-heading">${icon("alert")}<strong>Add a valid destination</strong></div><p>This template needs an HTTP or HTTPS URL. No request has been sent.</p></div>` : requestDetails()}</main><footer class="dock"><button type="button" class="primary" data-action="${invalid ? "fix" : "send"}" aria-busy="${busy}" ${busy ? "disabled" : ""}>${icon(invalid ? "settings" : busy ? "spinner" : "send", busy ? "spin" : "")}<span>${invalid ? "Edit webhook" : busy ? "Sending..." : ["success", "receipt", "unknown", "accepted"].includes(state) ? "Send again" : "Send"}</span></button>${feedback()}</footer>`;
}

function renderBaseline() {
  const $ = (id) => document.getElementById(id);
  const empty = state === "empty";
  const loadError = state === "load-error";
  $("no-config").style.display = empty ? "block" : "none";
  $("webhook-panel").style.display = empty || loadError ? "none" : "block";
  $("send-btn").hidden = empty || loadError;
  if (loadError) {
    $("toast").className = "toast error visible";
    $("toast").textContent = "Could not establish connection. Receiving end does not exist.";
    return;
  }
  $("template-select").replaceChildren(new Option(templateName, "demo"));
  $("method-badge").textContent = "POST";
  $("url-display").textContent = endpoint;
  $("page-title").textContent = "cloudflare/agents: Build and deploy AI Agents on Cloudflare";
  $("page-host").textContent = capture.url;
  $("popup-request-preview").textContent = state === "invalid" ? "Enter an HTTP or HTTPS webhook URL." : requestText();
  const params = [...Object.entries(capture).map(([key, value]) => ({ key, value })), ...(state === "long" ? longValues : [])];
  $("params-preview").innerHTML = params.map(({ key, value }) => `<div class="param-item"><span class="param-key">${key}</span><textarea rows="1" aria-label="${key}">${escapeHTML(value)}</textarea></div>`).join("");
  const hasResult = ["sending", "success", "accepted", "failed", "unknown", "duplicate", "receipt"].includes(state);
  $("last-result").hidden = !hasResult;
  if (hasResult) {
    const resultState = state === "failed" ? "failed" : state === "unknown" ? "unknown" : state === "sending" ? "sending" : "success";
    $("last-result").dataset.state = resultState;
    $("last-result-name").textContent = templateName;
    $("last-result-time").textContent = "06:00 AM";
    $("last-result-id").textContent = "8a0f56c4-a60e-4b52-a5d6-560c468a6d24";
    $("last-result-status").textContent = ({ sending: "Sending...", success: "Receiver responded (HTTP 201)", receipt: "Receiver responded (HTTP 201)", accepted: "Accepted (HTTP 202). Processing may still be in progress.", failed: "Failed (401)", unknown: "Result unconfirmed. Check the receiver before sending again.", duplicate: "Repeated request skipped. Showing the previous result. Receiver responded (HTTP 201)" })[state];
  }
  $("send-btn").disabled = state === "sending";
  $("send-btn").setAttribute("aria-busy", String(state === "sending"));
  $("send-label").textContent = state === "sending" ? "Sending..." : "Send";
  $("duplicate-actions").hidden = state !== "duplicate";
  $("send-anyway").disabled = false;
  $("duplicate-preview").textContent = requestText();
  if (state === "receipt") {
    $("result-details").open = true;
    $("last-response").hidden = false;
    $("last-response").open = true;
    $("response-body").textContent = '{"saved":true,"id":"link-1042"}';
    $("response-fields-summary").innerHTML = '<dt>Receipt ID</dt><dd>link-1042</dd><dt>Message</dt><dd>Link added to your list</dd>';
  }
  if (state === "invalid") document.querySelector(".popup-preview").open = true;
}

function render() {
  if (proposal) renderProposal();
  else renderBaseline();
}
render();

if (proposal) {
  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "settings") { settingsNote = true; if (state === "duplicate") state = "ready"; }
    if (["setup", "reload", "back", "fix"].includes(action)) { state = "ready"; settingsNote = false; }
    if (["send", "send-anyway"].includes(action)) {
      state = "sending";
      settingsNote = false;
      clearTimeout(sendTimer);
      sendTimer = setTimeout(() => { state = initialState === "failed" ? "failed" : "success"; render(); }, 1600);
    }
    render();
  });
  document.addEventListener("input", (event) => {
    if (!event.target.matches("textarea[data-field]")) return;
    if (Object.hasOwn(capture, event.target.dataset.field)) capture[event.target.dataset.field] = event.target.value;
    for (const preview of document.querySelectorAll("[data-request]")) preview.textContent = requestText();
  });
  document.addEventListener("change", (event) => {
    if (event.target.id === "template") { templateName = event.target.value; state = "ready"; render(); }
  });
} else {
  for (const button of document.querySelectorAll("button")) button.addEventListener("click", () => {
    const toast = document.getElementById("toast");
    toast.textContent = "Static baseline only. Try the proposal to simulate this action.";
    toast.className = "toast visible";
  });
}

function reportSize() {
  const root = document.querySelector(proposal ? ".popup" : ".container");
  parent.postMessage({ type: "hooky-review-size", height: Math.ceil(root.getBoundingClientRect().height) }, "*");
}
reportSize();
new ResizeObserver(reportSize).observe(document.querySelector(proposal ? ".popup" : ".container"));
