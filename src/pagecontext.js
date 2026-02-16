/**
 * Shared page context module.
 *
 * Injects the extractPageContext function into the active tab via
 * chrome.scripting.executeScript() and returns the result, falling
 * back to basic tab info when injection is not possible (e.g. on
 * chrome:// pages or when the tab has no id).
 */

/**
 * Self-contained extraction function injected into the tab.
 * Must NOT reference any outer scope — it runs in an isolated world.
 */
function extractPageContext() {
  const meta = {};

  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) {
    meta.description = metaDescription.getAttribute("content") || "";
  }

  const ogTags = document.querySelectorAll('meta[property^="og:"]');
  for (const tag of ogTags) {
    const property = tag.getAttribute("property");
    const content = tag.getAttribute("content");
    if (property && content) {
      meta[property] = content;
    }
  }

  return {
    page: {
      url: location.href,
      title: document.title,
      selection: window.getSelection()?.toString() || "",
      meta,
    },
  };
}

/**
 * Build a fallback context object from basic tab properties.
 *
 * @param {chrome.tabs.Tab|null|undefined} tab
 * @returns {{ page: { url: string, title: string, selection: string, meta: object } }}
 */
function fallbackContext(tab) {
  return {
    page: {
      url: tab?.url || "",
      title: tab?.title || "",
      selection: "",
      meta: {},
    },
  };
}

export { extractPageContext };

/**
 * Get page context from a tab by injecting the extraction script.
 *
 * @param {chrome.tabs.Tab|null|undefined} tab
 * @returns {Promise<{ page: { url: string, title: string, selection: string, meta: object } }>}
 */
export async function getPageContext(tab) {
  if (!tab?.id) return fallbackContext(tab);

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageContext,
    });

    // executeScript returns an array of InjectionResult objects
    const result = results?.[0]?.result;
    return result || fallbackContext(tab);
  } catch {
    return fallbackContext(tab);
  }
}
