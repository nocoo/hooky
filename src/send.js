import { prepareWebhook, executeRequest } from "./webhook.js";
import { publishResult } from "./feedback.js";
import { t } from "./i18n.js";

const inFlight = new Map();
let lastStartedAt = 0;

/** All three entry points share request identity, the pending guard and feedback. */
export function sendWebhook(config, context, { tab = null, source = "popup", resolved = false } = {}) {
  const record = {
    id: crypto.randomUUID(), templateId: config.id || "", name: (config.name || t("defaultTemplateName")).slice(0, 100),
    tabId: tab?.id ?? null, source, startedAt: lastStartedAt = Math.max(Date.now(), lastStartedAt + 1), state: "sending",
  };
  const surface = { tab, source };
  let request;
  try { request = prepareWebhook(config, context, resolved); }
  catch (error) {
    const result = { ...record, ok: false, state: "failed", error: error.message, finishedAt: Date.now() };
    return publishResult(result, { ...surface, start: true }).then(() => result);
  }
  const key = JSON.stringify([record.tabId, record.templateId, request]);
  if (inFlight.has(key)) return inFlight.get(key);

  const task = (async () => {
    await publishResult(record, { ...surface, start: true });
    const result = { ...record, ...await executeRequest(request), finishedAt: Date.now() };
    await publishResult(result, surface);
    return result;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, task);
  return task;
}
