import { buildRequestBody, buildRequestUrl } from "./params.js";
import { resolveTemplate } from "./template.js";
import { discardBody, readReceipt } from "./response.js";

/** HTTP methods that carry params in URL query string instead of body */
const QUERY_METHODS = new Set(["GET", "DELETE"]);
const METHODS = new Set(["GET", "DELETE", "POST", "PUT", "PATCH"]);
export const REQUEST_TIMEOUT = 20000;
const FORBIDDEN_HEADERS = new Set([
  "accept-charset", "accept-encoding", "access-control-request-headers", "access-control-request-method",
  "connection", "content-length", "cookie", "cookie2", "date", "dnt", "expect", "host", "keep-alive",
  "origin", "permissions-policy", "referer", "set-cookie", "te", "trailer", "transfer-encoding", "upgrade", "user-agent", "via",
]);

/** Authentication stays with its template. Browser-managed headers cannot be overridden. */
export function buildHeaders(rows = [], context = {}) {
  let headers = { "Content-Type": "application/json" };
  const seen = new Set();
  for (const { key, value } of rows) {
    if (!key.trim() && !value) continue;
    const name = key.trim().toLowerCase();
    if (name === "content-type" || FORBIDDEN_HEADERS.has(name) || /^(sec-|proxy-)/.test(name)) throw new Error("managedHeader");
    if (seen.has(name)) throw new Error("duplicateHeader");
    const resolved = resolveTemplate(value, context);
    if (["x-http-method", "x-http-method-override", "x-method-override"].includes(name) && /\b(CONNECT|TRACE|TRACK)\b/i.test(resolved)) throw new Error("managedHeader");
    try {
      // Headers validates HTTP token names, line breaks and ByteString values.
      const validated = new Headers([[name, resolved]]);
      headers = { ...headers, [name]: validated.get(name) };
    } catch { throw new Error("invalidHeader"); }
    seen.add(name);
  }
  return headers;
}

/** Prepare once so the send guard compares exactly what will be sent. */
export function prepareWebhook(config, context, alreadyResolved = false) {
  const { url, method, params } = config;
  let endpoint;
  try { endpoint = new URL(url); }
  catch { throw new Error("invalidEndpoint"); }
  if (!["http:", "https:"].includes(endpoint.protocol)) throw new Error("invalidEndpoint");
  if (!METHODS.has(method)) throw new Error("invalidMethod");

  const options = { method, headers: buildHeaders(config.headers, context) };
  // Custom headers can contain secrets under any name. Do not forward them on redirects.
  if (Object.keys(options.headers).length > 1) options.redirect = "error";
  if (!QUERY_METHODS.has(method)) {
    options.body = JSON.stringify(buildRequestBody(params, context, alreadyResolved));
  }
  return { url: buildRequestUrl(url, params, context, method, alreadyResolved), options };
}

/** Preview requests with all custom header values redacted, including nonstandard API keys. */
export function previewRequest(config, context, alreadyResolved = false) {
  const request = prepareWebhook(config, context, alreadyResolved);
  const lines = [`${request.options.method} ${request.url}`];
  for (const [name, value] of Object.entries(request.options.headers)) {
    lines.push(`${name}: ${name === "Content-Type" ? value : "••••"}`);
  }
  if (request.options.body) lines.push("", JSON.stringify(JSON.parse(request.options.body), null, 2));
  return lines.join("\n");
}

/** A lost response cannot tell us whether the receiver committed the write. */
export async function executeRequest(request, responseConfig = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(request.url, { ...request.options, signal: controller.signal });
    const result = { ok: response.ok, status: response.status, state: response.ok ? "success" : "failed" };
    if (responseConfig.enabled === true) result.receipt = await readReceipt(response).catch(() => ({ note: "responseUnavailable" }));
    else discardBody(response.body);
    return result;
  } catch {
    return { ok: false, state: "unknown", error: "requestUnconfirmed" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Execute a webhook request.
 *
 * @param {object} config - Webhook configuration
 * @param {string} config.url - The webhook URL
 * @param {string} config.method - HTTP method (GET/POST/PUT/PATCH/DELETE)
 * @param {Array<{key: string, value: string}>} config.params - Key-value params
 * @param {object} context - Template variable context
 * @returns {Promise<{ok: boolean, status?: number, error?: string}>}
 */
export async function executeWebhook(config, context, alreadyResolved = false) {
  try {
    return await executeRequest(prepareWebhook(config, context, alreadyResolved), config.response);
  } catch (err) {
    return { ok: false, state: "failed", error: err.message };
  }
}
