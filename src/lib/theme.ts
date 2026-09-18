/**
 * Theme plumbing shared by the server layout and the client toggle.
 *
 * This module is deliberately React-free so the root layout (a Server
 * Component) can import the init script from it.
 */

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

/** What a first-time visitor gets, and the value the server renders. */
export const DEFAULT_THEME: Theme = "light";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

/**
 * Runs synchronously in `<head>`, before the browser paints anything, so a
 * returning visitor who chose dark never sees a flash of the light palette.
 *
 * It only reads storage and stamps the attribute the stylesheet keys off.
 * Deliberately not deferred, not a module, and wrapped in try/catch because
 * `localStorage` throws outright in some privacy modes.
 */
export const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var theme = stored === "dark" || stored === "light" ? stored : ${JSON.stringify(DEFAULT_THEME)};
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (error) {
    document.documentElement.dataset.theme = ${JSON.stringify(DEFAULT_THEME)};
  }
})();
`.trim();
