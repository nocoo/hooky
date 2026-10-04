function typographyViolations(selector = "body") {
  const host = document.querySelector(selector);
  const root = host.shadowRoot || host;
  return [...root.querySelectorAll("*")].filter((element) => {
    if (element.namespaceURI !== "http://www.w3.org/1999/xhtml" || element.matches("script, style, template")) return false;
    return element.matches("input, textarea, select") || [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  }).flatMap((element) => {
    const size = getComputedStyle(element).fontSize;
    return ["10px", "12px", "14px"].includes(size) ? [] : [{ element: element.id || element.tagName, size }];
  });
}

module.exports = { typographyViolations };
