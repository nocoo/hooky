// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { applyTheme } from "../src/theme.js";

describe("applyTheme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("should set data-theme to light", () => {
    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("should set data-theme to dark", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("should remove data-theme for system", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    applyTheme("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("should treat unknown value as system (remove attribute)", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    applyTheme("invalid");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("should treat undefined as system", () => {
    document.documentElement.setAttribute("data-theme", "light");
    applyTheme(undefined);
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});
