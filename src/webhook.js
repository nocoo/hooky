import { buildRequestBody, buildRequestUrl } from "./params.js";

/** HTTP methods that carry params in URL query string instead of body */
const QUERY_METHODS = new Set(["GET", "DELETE"]);

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
export async function executeWebhook(config, context) {
  const { url, method, params } = config;

  try {
    const finalUrl = buildRequestUrl(url, params, context, method);

    const options = {
      method,
      headers: { "Content-Type": "application/json" },
    };

    if (!QUERY_METHODS.has(method)) {
      options.body = JSON.stringify(buildRequestBody(params, context));
    }

    const response = await fetch(finalUrl, options);

    return { ok: response.ok, status: response.status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
