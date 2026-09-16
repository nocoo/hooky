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
export function openPanel() {
  if (opening) return opening;
  opening = (async () => {
    await chrome.action.setPopup({ popup: POPUP_PATH });
    try {
      await chrome.action.openPopup();
    } catch {
      await chrome.tabs.create({ url: chrome.runtime.getURL(POPUP_PATH) });
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
    :host{all:initial;color-scheme:light dark}*{box-sizing:border-box}
    section{--surface:light-dark(#fff,#211e28);--text:light-dark(#2d2637,#f1edf6);--muted:light-dark(#756b80,#b4a9bf);--accent:light-dark(#7851a5,#c8a6f0);--state:var(--accent);--line:light-dark(#e8e2ee,#39313f);position:relative;display:grid;grid-template-columns:36px minmax(0,1fr);align-items:start;gap:12px;width:368px;max-width:calc(100vw - 40px);max-height:calc(100dvh - 40px);overflow:auto;font:13px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--surface);color:var(--text);border:1px solid color-mix(in srgb,var(--state) 28%,var(--line));border-left:3px solid var(--state);border-radius:14px;padding:18px;box-shadow:0 4px 12px #21122f0a,0 16px 48px #21122f26;overflow-wrap:anywhere;animation:enter .22s ease-out}
    section[data-state="success"]{--state:light-dark(#21715b,#89d6b2)}section[data-state="failed"]{--state:light-dark(#b23d53,#f1a0ad)}section[data-state="unknown"]{--state:light-dark(#896014,#e5bd72)}
    .state-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:color-mix(in srgb,var(--state) 12%,var(--surface));color:var(--state)}
    svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.state-icon svg>*{display:none}
    [data-state="success"] .check,[data-state="failed"] .cross,[data-state="unknown"] .warning,[data-state="sending"] .spinner{display:initial}.spinner{transform-origin:center;animation:spin .8s linear infinite}
    small{display:block;color:var(--muted);font-size:10px;font-weight:650;letter-spacing:.08em;line-height:16px}strong{display:block;padding-right:24px;margin:2px 0 5px;font-size:14px;font-weight:650;line-height:1.45}p{margin:0 0 14px;color:var(--muted)}
    button{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:32px;border:1px solid var(--line);border-radius:7px;padding:5px 10px;font:550 12px/20px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--surface);color:var(--accent);cursor:pointer;transition:background-color .15s}
    button:hover{background:color-mix(in srgb,var(--accent) 8%,var(--surface))}button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.view::after{content:"→"}.close{position:absolute;right:10px;top:10px;width:28px;min-height:28px;padding:3px;border-color:transparent;color:var(--muted)}.close svg{width:16px;height:16px}
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
  icon.innerHTML = '<svg viewBox="0 0 24 24"><path class="check" d="m5 12 4 4L19 6"/><path class="cross" d="m7 7 10 10M17 7 7 17"/><path class="warning" d="M12 6v8m0 4h.01"/><path class="spinner" d="M20 12a8 8 0 1 1-8-8"/></svg>';
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
  view.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_PANEL" }).catch(() => {});
  });
  const close = document.createElement("button");
  close.type = "button";
  close.className = "close";
  close.setAttribute("aria-label", labels.close);
  close.title = labels.close;
  close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';
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
    if (result.state !== "sending") await openPanel().catch(() => {});
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
