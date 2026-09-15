import { prepareWebhook, executeRequest } from "./webhook.js";
import { publishResult } from "./feedback.js";
import { t } from "./i18n.js";
import { requestFingerprint, findRecent, rememberSend, holdDuplicate, takeDuplicateCapture } from "./duplicates.js";

const inFlight = new Map();
let lastStartedAt = 0;

/** All three entry points share request identity, the pending guard and feedback. */
export function sendWebhook(config, context, { tab = null, source = "popup", resolved = false, force = false } = {}) {
  const record = {
    id: crypto.randomUUID(), templateId: config.id || "", name: (config.name || t("defaultTemplateName")).slice(0, 100),
    tabId: tab?.id ?? null, source, startedAt: lastStartedAt = Math.max(Date.now(), lastStartedAt + 1), state: "sending",
  };
  const surface = { tab, source };
  let request;
  let key;
  try {
    request = prepareWebhook(config, { ...context, send: { id: record.id } }, resolved);
    const comparison = prepareWebhook(config, { ...context, send: { id: "<Hooky:send.id>" } }, resolved);
    // Distinguish an actual binding from pasted literal variable syntax.
    const bindings = [
      ...config.params.filter((param) => (!resolved || param.resolve) && /\{\{\s*send\.id\s*\}\}/.test(param.value)).map((param) => ["param", param.key]),
      ...(config.headers || []).filter((header) => /\{\{\s*send\.id\s*\}\}/.test(header.value)).map((header) => ["header", header.key.toLowerCase()]),
    ];
    key = JSON.stringify([record.templateId, comparison, bindings]);
  }
  catch (error) {
    const result = { ...record, ok: false, state: "failed", error: error.message, finishedAt: Date.now() };
    return publishResult(result, { ...surface, start: true }).then(() => result);
  }
  if (inFlight.has(key)) {
    const pending = inFlight.get(key);
    if (pending.record.tabId === record.tabId) return pending.task;
    const observed = { tabId: record.tabId, source, lastActionAt: record.startedAt };
    const feedback = publishResult({ ...pending.record, ...observed }, { ...surface, start: true });
    return pending.task.then(async (result) => {
      await feedback;
      const mirrored = { ...result, ...observed };
      await publishResult(mirrored, { ...surface, start: true });
      return mirrored;
    });
  }

  const task = (async () => {
    const duplicateWindow = Number.isInteger(config.duplicateWindow) && config.duplicateWindow > 0 ? Math.min(config.duplicateWindow, 300) : 0;
    let fingerprint;
    if (duplicateWindow) {
      try {
        fingerprint = await requestFingerprint(key);
        const previous = await findRecent(fingerprint, duplicateWindow);
        if (previous && !force) {
          const duplicateToken = holdDuplicate(config, context, { tab, source, resolved });
          const result = { ...previous, tabId: record.tabId, source, lastActionAt: record.startedAt, duplicateToken };
          await publishResult(result, { ...surface, start: true });
          return result;
        }
        await rememberSend(fingerprint, record, duplicateWindow);
      } catch {
        const result = { ...record, ok: false, state: "failed", error: "duplicateCheckFailed", finishedAt: Date.now() };
        await publishResult(result, { ...surface, start: true });
        return result;
      }
    }
    const feedback = publishResult(record, { ...surface, start: true });
    const result = { ...record, ...await executeRequest(request, config.response), finishedAt: Date.now() };
    if (fingerprint) await rememberSend(fingerprint, result, duplicateWindow).catch(() => {});
    await feedback;
    await publishResult(result, surface);
    return result;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, { task, record });
  return task;
}

export function sendAnyway(token) {
  const capture = takeDuplicateCapture(token);
  if (!capture) return Promise.resolve({ ok: false, state: "failed", error: "captureExpired" });
  return sendWebhook(capture.config, capture.context, { ...capture.options, source: "popup", force: true });
}
