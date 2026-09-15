export const RESPONSE_LIMIT = 8192;
export const RESPONSE_TIMEOUT = 3000;

export function validateResponseConfig(config = {}) {
  if (config.enabled !== true) return;
  for (const path of [config.messagePath, config.receiptPath, config.successPath]) {
    if (path && (typeof path !== "string" || path.length > 200 || path.split(".").some((key) => !key || key !== key.trim()))) throw new Error("invalidResponsePath");
  }
  if (config.successPath) {
    try {
      const value = JSON.parse(config.successValue);
      if (value !== null && typeof value === "object" || typeof value === "number" && !Number.isFinite(value)) throw new Error();
    } catch { throw new Error("invalidSuccessValue"); }
  }
}

/** Simple own-property traversal; no expressions, inherited properties or JSONPath. */
function fieldAt(value, path) {
  for (const key of path.split(".")) {
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, key)) return undefined;
    value = value[key];
  }
  return value;
}

/** Business confirmation is opt-in and never overrides an HTTP failure. */
export function applyResponseFields(result, config) {
  if (!config.messagePath && !config.receiptPath && !config.successPath) return;
  const receipt = result.receipt;
  let data;
  if (!receipt.note) {
    try { data = JSON.parse(receipt.text); }
    catch { receipt.fieldNote = "responseFieldMissing"; }
  }
  for (const [field, path] of [["message", config.messagePath], ["receiptId", config.receiptPath]]) {
    if (!path) continue;
    const value = fieldAt(data, path);
    if (value === undefined || value !== null && typeof value === "object") receipt.fieldNote = "responseFieldMissing";
    else receipt[field] = String(value).slice(0, 1000);
  }
  if (!config.successPath) return;
  result.httpOk = result.ok;
  const actual = fieldAt(data, config.successPath);
  result.business = actual === undefined ? "unknown" : actual === JSON.parse(config.successValue) ? "matched" : "rejected";
  if (!result.httpOk || result.business === "matched") return;
  result.ok = false;
  result.state = result.business === "rejected" ? "failed" : "unknown";
  result.error = result.business === "rejected" ? "businessRejected" : "businessUnconfirmed";
}

/** Stop downloading an unused body without letting a stalled cancel hold up feedback. */
export function discardBody(body) {
  if (body) body.cancel().catch(() => {});
}

/** Bound retained bytes during streaming, including when the receiver never closes. */
export async function readReceipt(response) {
  // Small local adapters may omit Content-Type. Treat that case as bounded plain text.
  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const json = type === "application/json" || type.endsWith("+json");
  if (type && !json && !type.startsWith("text/")) {
    discardBody(response.body);
    return { note: "responseUnsupported" };
  }
  if (!response.body) return { text: "", note: "responseEmpty" };

  const reader = response.body.getReader();
  const buffer = new Uint8Array(RESPONSE_LIMIT);
  let size = 0;
  let timer;
  let note;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("responseUnavailable")), RESPONSE_TIMEOUT);
  });
  try {
    while (size < RESPONSE_LIMIT) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      const bytes = value.subarray(0, RESPONSE_LIMIT - size);
      buffer.set(bytes, size);
      size += bytes.length;
    }
    if (size === RESPONSE_LIMIT) note = "responseTruncated";
  } catch {
    note = "responseUnavailable";
  } finally {
    clearTimeout(timer);
    discardBody(reader);
  }
  const text = new TextDecoder().decode(buffer.subarray(0, size));
  if (!note && !text) note = "responseEmpty";
  if (!note && json) {
    try { JSON.parse(text); }
    catch { note = "responseInvalidJson"; }
  }
  return { text, format: json ? "json" : "text", ...(note ? { note } : {}) };
}
