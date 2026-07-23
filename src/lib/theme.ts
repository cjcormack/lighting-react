export type Theme = "light" | "dark"

// Resolve the theme to use: an explicit stored choice wins, otherwise fall back
// to the OS preference. Kept in one place so the pre-mount application in
// main.tsx and the ThemeToggle control can't drift apart.
export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light"

  const stored = localStorage.getItem("theme")
  if (stored === "dark" || stored === "light") return stored

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

// Reflect the theme onto the document root — Tailwind's `dark:` variant keys off
// this class. Persisting a user's choice is the caller's job (see ThemeToggle).
export function applyThemeClass(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark")
}
