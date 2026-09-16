import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { applyThemeClass, getInitialTheme, type Theme } from "@/lib/theme"

/**
 * The light/dark choice, applied to the document and persisted.
 *
 * **Exactly one instance of this may be mounted**, and `UserMenu` is what guarantees it: the one
 * consumer, `ThemeMenuItem`, is rendered once there on every branch — a standalone header button
 * was the second consumer until the menu opened on a bootstrap-open desk too. The reason is the one
 * `usePersistentState`'s docblock gives for its own key rule — this is a `useState` seeded once
 * from storage with no listener, so two mounted copies would hold two snapshots and the one you
 * did not press would go on claiming the old theme. It is deliberately *not* built on
 * `lib/syncStore.ts`, which would otherwise be the fix: that JSON-encodes, and `theme` is stored
 * as the bare string `dark`, which `getInitialTheme` reads at module scope in `main.tsx` before
 * React exists. Re-encoding it would black out the pre-mount paint on every existing desk.
 */
function useThemeChoice() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    applyThemeClass(theme)
    try {
      localStorage.setItem("theme", theme)
    } catch {
      // Quota exhausted or storage unavailable. The class is already on the document, so the
      // theme holds for this session; it just won't survive a reload.
    }
  }, [theme])

  return {
    theme,
    next: theme === "light" ? ("dark" as const) : ("light" as const),
    toggle: () => setTheme(prev => (prev === "light" ? "dark" : "light")),
  }
}

/**
 * The theme control as a row of the user menu, which is where it lives now.
 *
 * It was a ninth icon button in the app header. That row does not fit an iPhone in portrait — nine
 * controls came to 439px against a 375px viewport, and the avatar at the end of it was the part
 * pushed off the screen — and of everything on it, a per-viewer display preference is the one
 * thing that is not a desk control at all. So it sits with the other per-viewer things instead,
 * one press further away in exchange for 40px on every width.
 */
export function ThemeMenuItem() {
  const { theme, next, toggle } = useThemeChoice()
  return (
    <DropdownMenuItem onSelect={toggle}>
      {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
      Switch to {next} mode
    </DropdownMenuItem>
  )
}
