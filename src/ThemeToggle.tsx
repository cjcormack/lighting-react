import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { applyThemeClass, getInitialTheme, type Theme } from "@/lib/theme"

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    applyThemeClass(theme)
    localStorage.setItem("theme", theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => (prev === "light" ? "dark" : "light"))
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="text-primary-foreground hover:bg-primary-foreground/10"
        >
          {theme === "light" ? (
            <Moon className="size-5" />
          ) : (
            <Sun className="size-5" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Switch to {theme === "light" ? "dark" : "light"} mode
      </TooltipContent>
    </Tooltip>
  )
}
