import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { applyThemeClass, getInitialTheme, type Theme } from "@/lib/theme"

/**
 * The light/dark choice, applied to the document and persisted.
 *
 * **Exactly one instance of this may be mounted**, and `UserMenu` is what guarantees it: the two
 * consumers below are its mutually exclusive branches, never both. The reason is the one
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

/**
 * The standalone header button.
 *
 * Kept for one case: `UserMenu` renders this instead of `null` when there is no signed-in user,
 * so the theme control cannot disappear along with the avatar.
 *
 * Be honest about what that is worth. `AuthGate` renders `SetupScreen` or `LoginScreen` rather
 * than `Layout` unless `authenticated` is true, and the two public routes are siblings of `Layout`
 * rather than children — so no reachable state appears to render `UserMenu` with no user, and this
 * branch is very likely dead. It is kept because `AuthStatus.user` is optional in the type, the
 * branch is pinned by a test, and one component is a cheap hedge against that ever changing. It
 * is **not** a claim that the theme is reachable everywhere: neither the setup screen nor the
 * login screen has ever had a theme control, before this change or after it.
 */
export default function ThemeToggle() {
  const { next, toggle } = useThemeChoice()

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          className="text-primary-foreground hover:bg-primary-foreground/10"
        >
          {next === "dark" ? <Moon className="size-5" /> : <Sun className="size-5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Switch to {next} mode</TooltipContent>
    </Tooltip>
  )
}
