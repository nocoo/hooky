/**
 * Resolve template variables in a string using the given context.
 *
 * Supports `{{path.to.value}}` syntax with optional whitespace inside braces.
 * Unknown paths resolve to empty string.
 *
 * @param {string} template - The template string containing {{variables}}
 * @param {object} context - The context object to resolve variables from
 * @returns {string} The resolved string
 */
export function resolveTemplate(template, context) {
  if (!template) return "";

  return template.replace(/\{\{\s*(.+?)\s*\}\}/g, (_match, path) => {
    const value = resolvePath(context, path.trim());
    return value != null ? String(value) : "";
  });
}

/**
 * Resolve a dot-separated path against an object.
 * Supports colon-containing keys like "og:title" by treating
 * the first segment before "." as a key boundary.
 *
 * @param {object} obj - The object to traverse
 * @param {string} path - Dot-separated path (e.g. "page.meta.og:title")
 * @returns {*} The resolved value or undefined
 */
function resolvePath(obj, path) {
  const segments = path.split(".");
  let current = obj;

  for (const segment of segments) {
    if (current == null || typeof current !== "object") {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}
