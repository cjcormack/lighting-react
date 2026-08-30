export type Theme = "light" | "dark"

// Resolve the theme to use: an explicit stored choice wins, otherwise fall back
// to the OS preference. Kept in one place so the pre-mount application in
// main.tsx and the ThemeToggle control can't drift apart.
export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light"

  // Wrapped because this one runs at module scope in main.tsx, before React mounts and so before
  // any error boundary exists: `localStorage` throws outright when site data is blocked or in
  // some embedded views, and a throw here is a blank page with nothing in it to explain itself.
  // Degrades to the OS preference, which is what a first-time visitor gets anyway.
  try {
    const stored = localStorage.getItem("theme")
    if (stored === "dark" || stored === "light") return stored
  } catch {
    // Storage unavailable — fall through to the OS preference.
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

// Reflect the theme onto the document root — Tailwind's `dark:` variant keys off
// this class. Persisting a user's choice is the caller's job (see ThemeToggle).
export function applyThemeClass(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark")
}
