export const RESPONSE_LIMIT = 8192;
export const RESPONSE_TIMEOUT = 3000;

/** Stop downloading an unused body without letting a stalled cancel hold up feedback. */
export function discardBody(body) {
  if (body) body.cancel().catch(() => {});
}

/** Bound retained bytes during streaming, including when the receiver never closes. */
export async function readReceipt(response) {
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
