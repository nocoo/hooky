import { t } from "./i18n.js";
import { loadStore } from "./store.js";

export const LAST_RESULT_KEY = "hookyLastResult";
export const PAGE_FEEDBACK_TIMEOUT = 1500;
const TAB_RESULT_PREFIX = "hookyResult:";
const POPUP_PATH = "src/popup/popup.html";
let writes = Promise.resolve();
let opening;

export function resultMessage(result) {
  let message;
  if (result.state === "sending") message = t("sending");
  else if (result.error) message = t(result.error);
  else if (result.state === "unknown") message = t("requestUnconfirmed");
  else if (result.business === "matched" && result.ok) message = t("businessConfirmed");
  else if (result.status === 202) message = t("requestAccepted");
  else message = t(result.ok ? "successStatus" : "failedStatus", [String(result.status)]);
  return result.duplicateToken ? `${t("duplicateSkipped")} ${message}` : message;
}

/** Viewing the panel never evaluates a Quick Send rule. */
export function openPanel({ showResult = false } = {}) {
  if (opening) return opening;
  const popup = POPUP_PATH + (showResult ? "?view=last" : "");
  opening = (async () => {
    await chrome.action.setPopup({ popup });
    try {
      await chrome.action.openPopup();
    } catch {
      await chrome.tabs.create({ url: chrome.runtime.getURL(popup) });
    } finally {
      await chrome.action.setPopup({ popup: "" });
    }
  })().finally(() => { opening = null; });
  return opening;
}

/** Runs in the extension's isolated world. Only generic status reaches the page. */
export function showPageFeedback(result, message, labels, expectedUrl) {
  if (location.href !== expectedUrl || !document.documentElement) return false;
  const mountId = "__hooky_send_feedback";
  let mount = document.getElementById(mountId);
  if (mount && Number(mount.dataset.startedAt) > result.startedAt) return true;
  if (mount?.dataset.sendId === result.id && mount.dataset.state !== "sending" && result.state === "sending") return true;
  if (!mount) {
    mount = document.createElement("div");
    mount.id = mountId;
    mount.attachShadow({ mode: "open" });
    document.documentElement.appendChild(mount);
  }
  mount.dataset.sendId = result.id;
  mount.dataset.startedAt = String(result.startedAt);
  mount.dataset.state = result.state;
  mount.style.cssText = "position:fixed!important;right:20px!important;bottom:20px!important;z-index:2147483647!important;max-width:calc(100vw - 40px)!important;";
  const root = mount.shadowRoot;
  root.innerHTML = `<style>
    :host{all:initial;color-scheme:light dark;--font-meta:10px;--font-body:12px;--font-title:14px}*{box-sizing:border-box}
    section{--surface:light-dark(#fff,#211e28);--text:light-dark(#2d2637,#f1edf6);--muted:light-dark(#756b80,#b4a9bf);--accent:light-dark(#7851a5,#c8a6f0);--state:var(--accent);--line:light-dark(#e8e2ee,#39313f);position:relative;display:grid;grid-template-columns:36px minmax(0,1fr);align-items:start;gap:12px;width:368px;max-width:calc(100vw - 40px);max-height:calc(100dvh - 40px);overflow:auto;font:var(--font-body)/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--surface);color:var(--text);border:1px solid color-mix(in srgb,var(--state) 28%,var(--line));border-left:3px solid var(--state);border-radius:14px;padding:18px;box-shadow:0 4px 12px #21122f0a,0 16px 48px #21122f26;overflow-wrap:anywhere;animation:enter .22s ease-out}
    section[data-state="success"]{--state:light-dark(#21715b,#89d6b2)}section[data-state="failed"]{--state:light-dark(#b23d53,#f1a0ad)}section[data-state="unknown"]{--state:light-dark(#896014,#e5bd72)}
    .state-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:color-mix(in srgb,var(--state) 12%,var(--surface));color:var(--state)}
    svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.state-icon svg{display:none}
    [data-state="success"] .check,[data-state="failed"] .cross,[data-state="unknown"] .warning,[data-state="sending"] .spinner{display:block}.spinner{transform-origin:center;animation:spin .8s linear infinite}
    small{display:block;color:var(--muted);font-size:var(--font-meta);font-weight:650;letter-spacing:.08em;line-height:16px}strong{display:block;padding-right:24px;margin:2px 0 5px;font-size:var(--font-title);font-weight:650;line-height:1.45}p{margin:0 0 14px;color:var(--muted)}
    button{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:32px;border:1px solid var(--line);border-radius:7px;padding:5px 10px;font:550 var(--font-body)/18px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--surface);color:var(--accent);cursor:pointer;text-transform:uppercase;transition:background-color .15s}
    button:hover{background:color-mix(in srgb,var(--accent) 8%,var(--surface))}button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.view svg{width:16px;height:16px}.close{position:absolute;right:10px;top:10px;width:28px;min-height:28px;padding:3px;border-color:transparent;color:var(--muted)}.close svg{width:16px;height:16px}
    @keyframes enter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}@keyframes spin{to{transform:rotate(360deg)}}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
  </style>`;
  const card = document.createElement("section");
  card.dataset.state = result.state;
  card.setAttribute("role", result.state === "failed" || result.state === "unknown" ? "alert" : "status");
  card.setAttribute("aria-live", card.getAttribute("role") === "alert" ? "assertive" : "polite");
  card.setAttribute("aria-atomic", "true");
  const icon = document.createElement("span");
  icon.className = "state-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = '<svg class="check" data-lucide="circle-check" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><circle cx="12" cy="12" r="10" /><path d="m16 9-5.5 5.5L8 12" /></svg><svg class="cross" data-lucide="circle-x" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></svg><svg class="warning" data-lucide="circle-alert" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg><svg class="spinner" data-lucide="loader-circle" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>';
  const copy = document.createElement("div");
  const brand = document.createElement("small");
  brand.textContent = "HOOKY";
  const title = document.createElement("strong");
  title.textContent = result.name;
  const text = document.createElement("p");
  text.textContent = message;
  const view = document.createElement("button");
  view.type = "button";
  view.className = "view";
  view.textContent = labels.view;
  view.insertAdjacentHTML("beforeend", '<svg class="icon" data-lucide="arrow-right" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>');
  view.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_PANEL", showResult: true }).catch(() => {});
  });
  const close = document.createElement("button");
  close.type = "button";
  close.className = "close";
  close.setAttribute("aria-label", labels.close);
  close.title = labels.close;
  close.innerHTML = '<svg class="icon" data-lucide="x" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>';
  close.addEventListener("click", () => mount.remove());
  copy.append(brand, title, text, view);
  card.append(icon, copy, close);
  root.appendChild(card);
  if (result.state === "success") {
    let expired = false;
    const dismissIfInactive = () => {
      if (expired && mount.dataset.sendId === result.id && mount.dataset.startedAt === String(result.startedAt) && !card.matches(":hover, :focus-within")) mount.remove();
    };
    setTimeout(() => { expired = true; dismissIfInactive(); }, 8000);
    card.addEventListener("pointerleave", dismissIfInactive);
    card.addEventListener("focusout", () => setTimeout(dismissIfInactive, 0));
  }
  return true;
}

async function showBadge(result) {
  const target = result.tabId === null ? {} : { tabId: result.tabId };
  const text = { sending: "…", success: "✓", failed: "✗", unknown: "?" }[result.state];
  const color = { sending: "#7851a5", success: "#4a9", failed: "#c44", unknown: "#946200" }[result.state];
  await Promise.allSettled([
    chrome.action.setBadgeText({ ...target, text }),
    chrome.action.setBadgeBackgroundColor({ ...target, color }),
    chrome.action.setTitle({ ...target, title: `Hooky · ${result.name} · ${resultMessage(result)}` }),
  ]);
}

/** Permission is requested only by the settings gesture, never while sending. */
export async function showDesktopNotification(result) {
  if (result.state === "sending") return;
  const mode = (await loadStore()).notificationMode;
  if (mode !== "all" && !(mode === "errors" && result.state !== "success")) return;
  if (!await chrome.permissions.contains({ permissions: ["notifications"] })) return;
  await chrome.notifications.create("hooky:" + result.id, {
    type: "basic", iconUrl: chrome.runtime.getURL("src/icons/icon128.png"),
    title: `Hooky · ${result.name}`, message: resultMessage(result),
    requireInteraction: result.state !== "success",
  });
}

/** Serialize metadata updates so an older completion cannot replace a newer send. */
export function publishResult(result, { tab, source, start = false } = {}) {
  const publish = writes.then(async () => {
    const tabKey = TAB_RESULT_PREFIX + result.tabId;
    let current = {};
    try { current = await chrome.storage.session.get([LAST_RESULT_KEY, tabKey]); }
    catch { /* Live feedback remains available if session storage is unavailable. */ }
    const updates = {};
    const canReplace = (previous) => !previous || ((start || previous.id === result.id) && (previous.lastActionAt || previous.startedAt) <= (result.lastActionAt || result.startedAt));
    if (canReplace(current[LAST_RESULT_KEY])) updates[LAST_RESULT_KEY] = result;
    if (!canReplace(current[tabKey])) return;
    updates[tabKey] = result;
    await Promise.allSettled([chrome.storage.session.set(updates), showBadge(result)]);
    await showDesktopNotification(result).catch(() => {});

    if (source === "popup" || result.tabId === null) return;
    let timer;
    try {
      const injected = await Promise.race([chrome.scripting.executeScript({
        target: { tabId: result.tabId },
        func: showPageFeedback,
        args: [
          { id: result.id, name: result.name, state: result.state, startedAt: result.lastActionAt || result.startedAt },
          resultMessage(result), { view: t("viewLastResult"), close: t("dismiss") }, tab.url,
        ],
      }), new Promise((resolve) => { timer = setTimeout(() => resolve([]), PAGE_FEEDBACK_TIMEOUT); })]);
      if (injected[0]?.result === true) return;
    } catch { /* Internal pages and navigation can prevent injection. */ }
    finally { clearTimeout(timer); }
    if (result.state !== "sending") await openPanel({ showResult: true }).catch(() => {});
  });
  writes = publish.catch(() => {});
  return writes;
}

export async function readLastResult() {
  const data = await chrome.storage.session.get(LAST_RESULT_KEY);
  return data[LAST_RESULT_KEY] || null;
}

/** A service worker restart is not permission to repeat an interrupted request. */
export async function recoverPendingResults() {
  const data = await chrome.storage.session.get(null);
  const updates = {};
  for (const [key, result] of Object.entries(data)) {
    if ((key === LAST_RESULT_KEY || key.startsWith(TAB_RESULT_PREFIX)) && result.state === "sending") {
      updates[key] = { ...result, ok: false, state: "unknown", error: "requestUnconfirmed", finishedAt: Date.now() };
      if (key !== LAST_RESULT_KEY) await showBadge(updates[key]);
    }
  }
  if (Object.keys(updates).length) await chrome.storage.session.set(updates);
}
