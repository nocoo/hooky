import { vi } from "vitest";
import { readFileSync } from "node:fs";

const messages = JSON.parse(readFileSync("_locales/en/messages.json", "utf8"));

/** Session storage and extension surfaces used by the shared sending pipeline. */
export function addFeedbackChrome(target, initial = {}) {
  const session = structuredClone(initial);
  target.storage ||= {};
  target.storage.local ||= { get: vi.fn().mockResolvedValue({}) };
  target.storage.session = {
    get: vi.fn(async (keys) => {
      if (keys === null) return structuredClone(session);
      const names = Array.isArray(keys) ? keys : [keys];
      return structuredClone(Object.fromEntries(names.filter((key) => key in session).map((key) => [key, session[key]])));
    }),
    set: vi.fn(async (values) => { Object.assign(session, structuredClone(values)); }),
  };
  target.storage.onChanged ||= { addListener: vi.fn() };
  target.i18n ||= { getMessage: vi.fn((key, substitutions = []) => {
    let message = messages[key]?.message || key;
    for (const placeholder of Object.values(messages[key]?.placeholders || {})) {
      message = message.replace(/\$STATUS\$/gi, substitutions[Number(placeholder.content.slice(1)) - 1]);
    }
    return message;
  }) };
  target.action ||= {};
  for (const method of ["setBadgeText", "setBadgeBackgroundColor", "setTitle", "setPopup", "openPopup"]) {
    target.action[method] ||= vi.fn().mockResolvedValue();
  }
  target.scripting ||= { executeScript: vi.fn().mockResolvedValue([{ result: true }]) };
  target.tabs ||= {};
  target.tabs.create ||= vi.fn().mockResolvedValue();
  target.runtime ||= {};
  target.runtime.getURL ||= (path) => "chrome-extension://hooky/" + path;
  target.runtime.sendMessage ||= vi.fn().mockResolvedValue({ ok: true });
  target.permissions ||= { contains: vi.fn().mockResolvedValue(false), request: vi.fn().mockResolvedValue(false) };
  target.notifications ||= { create: vi.fn().mockResolvedValue("notice"), onClicked: { addListener: vi.fn() } };
  return session;
}
