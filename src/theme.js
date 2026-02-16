/**
 * Theme module.
 *
 * Applies a theme preference to the document root element.
 * CSS uses [data-theme="dark"] / [data-theme="light"] selectors,
 * falling back to @media (prefers-color-scheme) when no attribute is set ("system" mode).
 *
 * @param {string} theme - "system" | "light" | "dark"
 */
export function applyTheme(theme) {
  if (theme === "light" || theme === "dark") {
    document.documentElement.setAttribute("data-theme", theme);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}
