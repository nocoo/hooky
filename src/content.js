/**
 * Content script that collects page context information
 * and responds to messages from the popup/background.
 */

function getPageContext() {
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_PAGE_CONTEXT") {
    sendResponse(getPageContext());
  }
  return true;
});
