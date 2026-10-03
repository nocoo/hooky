// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { showPageFeedback } from "../src/feedback.js";

function shape(element) {
  return {
    tag: element.tagName,
    attributes: Object.fromEntries([...element.attributes].filter((attribute) => !["class", "data-lucide", "aria-hidden"].includes(attribute.name)).map((attribute) => [attribute.name, attribute.value])),
    children: [...element.children].map(shape),
  };
}

function verifyIcons(markup) {
  const parsed = new DOMParser().parseFromString(markup, "text/html");
  const icons = [...parsed.querySelectorAll("svg")];
  expect(icons.length).toBeGreaterThan(0);
  for (const icon of icons) {
    const name = icon.dataset.lucide;
    expect(name).toMatch(/^[a-z-]+$/);
    const original = new DOMParser().parseFromString(readFileSync(`tests/fixtures/lucide/${name}.svg`, "utf8"), "text/html").querySelector("svg");
    expect(shape(icon), name).toEqual(shape(original));
    expect(icon.getAttribute("aria-hidden")).toBe("true");
  }
}

describe("official Lucide geometry", () => {
  it.each(["src/popup/popup.html", "src/options/options.html", "src/options/options.js"])("copies complete official SVGs in %s", (file) => {
    const source = readFileSync(file, "utf8");
    verifyIcons([...source.matchAll(/<svg\b[^>]*>.*?<\/svg>/gs)].map(([svg]) => svg).join(""));
  });

  it("uses complete official SVGs in isolated page feedback", () => {
    showPageFeedback({ id: "icon-test", name: "Test", state: "sending", startedAt: 1 }, "Sending", { view: "View", close: "Close" }, location.href);
    const mount = document.getElementById("__hooky_send_feedback");
    verifyIcons(mount.shadowRoot.innerHTML);
    mount.remove();
  });

  it("uses the official chevron for native selects", () => {
    const css = readFileSync("src/ui.css", "utf8");
    const encoded = css.match(/url\("data:image\/svg\+xml,([^"]+)"\)/)[1];
    const svg = decodeURIComponent(encoded).replace("#9183a1", "currentColor");
    const parse = (text) => new DOMParser().parseFromString(text, "text/html").querySelector("svg");
    expect(shape(parse(svg))).toEqual(shape(parse(readFileSync("tests/fixtures/lucide/chevron-down.svg", "utf8"))));
  });
});
