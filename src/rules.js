/**
 * Match a single rule against page context.
 * @param {Object} rule - { field, operator, value }
 * @param {Object} page - { url, title }
 * @returns {boolean}
 */
export function matchRule(rule, page) {
  if (!rule.value) return false;

  const fieldValue = page[rule.field];
  if (!fieldValue) return false;

  const lower = fieldValue.toLowerCase();
  const target = rule.value.toLowerCase();

  switch (rule.operator) {
    case "contains":
      return lower.includes(target);
    case "equals":
      return lower === target;
    case "startsWith":
      return lower.startsWith(target);
    case "endsWith":
      return lower.endsWith(target);
    case "matches":
      try {
        return new RegExp(rule.value, "i").test(fieldValue);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/**
 * Find the first matching enabled rule for a page context.
 * @param {Array} rules - array of rule objects
 * @param {Object} page - { url, title }
 * @returns {Object|null} the matched rule or null
 */
export function findMatchingRule(rules, page) {
  if (!Array.isArray(rules)) return null;
  for (const rule of rules) {
    if (rule.enabled && matchRule(rule, page)) {
      return rule;
    }
  }
  return null;
}

