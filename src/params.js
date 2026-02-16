import { resolveTemplate } from "./template.js";

/** HTTP methods that carry params in the URL query string instead of body */
const QUERY_METHODS = new Set(["GET", "DELETE"]);

/**
 * Build a JSON request body from key-value params with template resolution.
 *
 * @param {Array<{key: string, value: string}>} params
 * @param {object} context - Template variable context
 * @returns {object} The resolved JSON body
 */
export function buildRequestBody(params, context) {
  const body = {};
  for (const { key, value } of params) {
    if (!key) continue;
    body[key] = resolveTemplate(value, context);
  }
  return body;
}

/**
 * Build the final request URL. For GET/DELETE, params are appended as query
 * string. For other methods, the URL is returned as-is.
 *
 * @param {string} baseUrl - The webhook URL
 * @param {Array<{key: string, value: string}>} params
 * @param {object} context - Template variable context
 * @param {string} method - HTTP method
 * @returns {string} The final URL
 */
export function buildRequestUrl(baseUrl, params, context, method) {
  if (!QUERY_METHODS.has(method)) return baseUrl;

  const validParams = params.filter((p) => p.key);
  if (validParams.length === 0) return baseUrl;

  const queryParts = validParams.map((p) => {
    const resolved = resolveTemplate(p.value, context);
    return `${encodeURIComponent(p.key)}=${encodeURIComponent(resolved)}`;
  });

  const separator = baseUrl.includes("?") ? "&" : "?";
  return baseUrl + separator + queryParts.join("&");
}
