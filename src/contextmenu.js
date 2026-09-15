import { sendWebhook } from "./send.js";
import { openPanel } from "./feedback.js";
import { t } from "./i18n.js";
import { getPageContext } from "./pagecontext.js";

const PARENT_ID = "hooky-parent";
const PREFIX = "hooky-";
const STORE_KEY = "hooky";
const CONTEXTS = ["page", "selection", "link", "image"];

/**
 * Build (or rebuild) the right-click context menu tree.
 *
 * Creates a parent "Hooky" item with one child per template.
 * Clears all existing menus first so this is safe to call repeatedly.
 *
 * @param {Array<{id: string, name: string}>} templates
 */
export async function buildContextMenus(templates) {
  await chrome.contextMenus.removeAll();

  chrome.contextMenus.create({ id: "hooky-open-panel", title: t("openSendPanel"), contexts: ["action"] });
  chrome.contextMenus.create({ id: "hooky-view-result", title: t("viewLastResult"), contexts: ["action"] });
  if (!templates || templates.length === 0) return;

  chrome.contextMenus.create({
    id: PARENT_ID,
    title: "Hooky",
    contexts: CONTEXTS,
  });

  for (const tpl of templates) {
    chrome.contextMenus.create({
      id: `${PREFIX}${tpl.id}`,
      parentId: PARENT_ID,
      title: tpl.name || "Untitled",
      contexts: CONTEXTS,
    });
  }
  chrome.contextMenus.create({ id: "hooky-menu-divider", parentId: PARENT_ID, type: "separator", contexts: CONTEXTS });
  chrome.contextMenus.create({ id: "hooky-menu-panel", parentId: PARENT_ID, title: t("openSendPanel"), contexts: CONTEXTS });
  chrome.contextMenus.create({ id: "hooky-menu-result", parentId: PARENT_ID, title: t("viewLastResult"), contexts: CONTEXTS });
}

/**
 * Handle a context menu click.
 *
 * Ignores clicks on the parent item or items not belonging to Hooky.
 * Extracts the template id from the menu item id, loads the template
 * from storage, gathers page context, executes the webhook, and
 * flashes a badge for feedback.
 *
 * @param {chrome.contextMenus.OnClickData} info
 * @param {chrome.tabs.Tab} tab
 */
export async function handleContextMenuClick(info, tab) {
  const menuId = String(info.menuItemId);

  if (["hooky-open-panel", "hooky-view-result", "hooky-menu-panel", "hooky-menu-result"].includes(menuId)) {
    await openPanel();
    return;
  }

  // Ignore non-hooky items or parent click
  if (!menuId.startsWith(PREFIX) || menuId === PARENT_ID) return;

  const templateId = menuId.slice(PREFIX.length);

  // Load store and find template
  const data = await chrome.storage.local.get(STORE_KEY);
  const store = data[STORE_KEY];
  if (!store?.templates) return;

  const config = store.templates.find((t) => t.id === templateId);
  if (!config || !config.url) return;

  const context = await getPageContext(tab);
  if (typeof info.selectionText === "string") context.page.selection = info.selectionText;
  await sendWebhook(config, context, { tab, source: "context" });
}
