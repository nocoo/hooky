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
  root.innerHTML = '<style>:host{all:initial}section{font:13px/1.5 system-ui,sans-serif;background:#fcfaff;color:#292330;border:1px solid #c8b4df;border-radius:10px;padding:14px;box-shadow:0 4px 24px #0003;max-width:340px;overflow-wrap:anywhere}strong{display:block;margin-bottom:4px}p{margin:0 0 8px}button{font:inherit;border:1px solid #c8b4df;border-radius:5px;background:#fff;color:#54377b;padding:4px 8px;cursor:pointer;margin-right:8px}button:focus-visible{outline:2px solid #7851a5}</style>';
  const card = document.createElement("section");
  card.setAttribute("role", result.state === "failed" || result.state === "unknown" ? "alert" : "status");
  card.setAttribute("aria-live", "polite");
  const title = document.createElement("strong");
  title.textContent = `Hooky · ${result.name}`;
  const text = document.createElement("p");
  text.textContent = message;
  const view = document.createElement("button");
  view.textContent = labels.view;
  view.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_PANEL" }).catch(() => {});
  });
  const close = document.createElement("button");
  close.textContent = labels.close;
  close.addEventListener("click", () => mount.remove());
  card.append(title, text, view, close);
  root.appendChild(card);
  if (result.state === "success") {
    setTimeout(() => {
      if (mount.dataset.sendId === result.id && mount.dataset.startedAt === String(result.startedAt)) mount.remove();
    }, 8000);
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
