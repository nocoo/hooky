import { previewRequest } from "./webhook.js";

export const RECENT_SENDS_KEY = "hookyRecentSends";
export const CAPTURE_LIFETIME = 60000;
const recent = new Map();
const captures = new Map();
let loaded;
let writes = Promise.resolve();

function prune(entries, limit) {
  for (const [key, entry] of entries) if (entry.expiresAt <= Date.now()) entries.delete(key);
  while (entries.size > limit) entries.delete(entries.keys().next().value);
}

async function loadRecent() {
  if (!loaded) loaded = chrome.storage.session.get(RECENT_SENDS_KEY).then((data) => {
    for (const entry of data[RECENT_SENDS_KEY] || []) {
      if (entry.result.state === "sending") entry.result = { ...entry.result, ok: false, state: "unknown", error: "requestUnconfirmed" };
      recent.set(entry.fingerprint, entry);
    }
    prune(recent, 50);
  }).catch((error) => { loaded = null; throw error; });
  await loaded;
}

export async function requestFingerprint(key) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function findRecent(fingerprint, windowSeconds) {
  await loadRecent();
  await writes;
  prune(recent, 50);
  const result = recent.get(fingerprint)?.result;
  return result && Date.now() - (result.finishedAt || result.startedAt) < windowSeconds * 1000 ? result : null;
}

/** Persist pending identity before opted-in sends, so worker restarts cannot silently replay them. */
export async function rememberSend(fingerprint, result, windowSeconds) {
  await loadRecent();
  const task = writes.then(async () => {
    const previous = recent.get(fingerprint);
    recent.delete(fingerprint);
    recent.set(fingerprint, { fingerprint, result, expiresAt: Date.now() + windowSeconds * 1000 });
    prune(recent, 50);
    try { await chrome.storage.session.set({ [RECENT_SENDS_KEY]: Array.from(recent.values()) }); }
    catch (error) {
      if (result.state === "sending") {
        if (previous) recent.set(fingerprint, previous);
        else recent.delete(fingerprint);
      }
      throw error;
    }
  });
  writes = task.catch(() => {});
  return task;
}

/** Only explicit duplicate protection retains a short-lived in-memory capture for Send anyway. */
export function holdDuplicate(config, context, options) {
  const token = crypto.randomUUID();
  captures.set(token, { config: structuredClone(config), context: structuredClone(context), options: structuredClone(options), expiresAt: Date.now() + CAPTURE_LIFETIME });
  setTimeout(() => captures.delete(token), CAPTURE_LIFETIME);
  prune(captures, 20);
  return token;
}

export function getDuplicateCapture(token) {
  prune(captures, 20);
  const capture = captures.get(token);
  if (!capture) return null;
  return { preview: previewRequest(capture.config, { ...capture.context, send: { id: "{{send.id}}" } }, capture.options.resolved) };
}

export function takeDuplicateCapture(token) {
  prune(captures, 20);
  const capture = captures.get(token);
  captures.delete(token);
  return capture;
}
