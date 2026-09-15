import { buildRequestBody, buildRequestUrl } from "./params.js";

/** HTTP methods that carry params in URL query string instead of body */
const QUERY_METHODS = new Set(["GET", "DELETE"]);
const METHODS = new Set(["GET", "DELETE", "POST", "PUT", "PATCH"]);
export const REQUEST_TIMEOUT = 20000;

/** Prepare once so the send guard compares exactly what will be sent. */
export function prepareWebhook(config, context, alreadyResolved = false) {
  const { url, method, params } = config;
  let endpoint;
  try { endpoint = new URL(url); }
  catch { throw new Error("invalidEndpoint"); }
  if (!["http:", "https:"].includes(endpoint.protocol)) throw new Error("invalidEndpoint");
  if (!METHODS.has(method)) throw new Error("invalidMethod");

  const options = { method, headers: { "Content-Type": "application/json" } };
  if (!QUERY_METHODS.has(method)) {
    options.body = JSON.stringify(buildRequestBody(params, context, alreadyResolved));
  }
  return { url: buildRequestUrl(url, params, context, method, alreadyResolved), options };
}

/** A lost response cannot tell us whether the receiver committed the write. */
export async function executeRequest(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(request.url, { ...request.options, signal: controller.signal });
    return { ok: response.ok, status: response.status, state: response.ok ? "success" : "failed" };
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
    return await executeRequest(prepareWebhook(config, context, alreadyResolved));
  } catch (err) {
    return { ok: false, state: "failed", error: err.message };
  }
}
