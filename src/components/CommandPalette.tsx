import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Command } from "cmdk"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Settings, FolderOpen, PlusCircle, Search, TableProperties, Bookmark, Clapperboard } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useProjectListQuery, useCurrentProjectQuery } from "@/store/projects"
import { useNavItems, filterNavItems } from "@/navigation"
import { useViewedProject } from "@/ProjectSwitcher"

export interface ToggleState {
  label: string
  icon: LucideIcon
  isVisible: boolean
  onToggle: () => void
}

interface CommandPaletteProps {
  onConfigureProject?: () => void
  toggles?: ToggleState[]
}

const itemClassName =
  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer aria-selected:bg-accent aria-selected:text-accent-foreground"

const groupClassName =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"

/**
 * Custom filter that matches substrings, concatenated word prefixes, and
 * initials — but not scattered characters.
 *
 * "pat"   → Patch List (prefix)
 * "plist" → Patch List (word-prefix concat: P + list)
 * "patli" → Patch List (word-prefix concat: Pat + li)
 * "pl"    → Patch List (initials)
 */
function commandFilter(value: string, search: string, keywords?: string[]): number {
  const needle = search.toLowerCase()

  // Score each source independently to avoid cross-contamination
  const sources = [value, ...(keywords ?? [])]
  let best = 0
  for (const source of sources) {
    best = Math.max(best, scoreSource(source.toLowerCase(), needle))
  }
  return best
}

function scoreSource(hay: string, needle: string): number {
  if (hay.startsWith(needle)) return 1

  const words = hay.split(/\s+/)
  if (words.some((w) => w.startsWith(needle))) return 0.9

  if (hay.includes(needle)) return 0.8

  // Word-prefix concatenation: needle is formed by taking a prefix of each word
  // e.g. "patli" matches "patch list" via "pat" + "li"
  if (matchWordPrefixes(needle, words, 0, 0)) return 0.7

  // Initials match: first letters of each word contain the needle
  const initials = words.map((w) => w[0] ?? "").join("")
  if (initials.includes(needle)) return 0.6

  return 0
}

/** Recursively check if needle[needleIdx..] can be formed by concatenating prefixes of words[wordIdx..]. */
function matchWordPrefixes(needle: string, words: string[], needleIdx: number, wordIdx: number): boolean {
  if (needleIdx >= needle.length) return true
  if (wordIdx >= words.length) return false

  const word = words[wordIdx]

  // Skip this word
  if (matchWordPrefixes(needle, words, needleIdx, wordIdx + 1)) return true

  // Take 1..n chars from this word's prefix
  for (let take = 1; take <= word.length && needleIdx + take <= needle.length; take++) {
    if (word[take - 1] !== needle[needleIdx + take - 1]) break
    if (matchWordPrefixes(needle, words, needleIdx + take, wordIdx + 1)) return true
  }

  return false
}

export default function CommandPalette({ onConfigureProject, toggles }: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { data: projects } = useProjectListQuery()
  const { data: currentProject } = useCurrentProjectQuery()
  const allNavItems = useNavItems()

  const viewedProject = useViewedProject()
  const isViewingActiveProject = viewedProject?.id === currentProject?.id
  const visibleItems = filterNavItems(allNavItems, isViewingActiveProject)

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  const runAction = (fn: () => void) => {
    setOpen(false)
    fn()
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      filter={commandFilter}
      loop
      overlayClassName="fixed inset-0 z-50 bg-black/50"
      contentClassName="fixed top-[20%] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 rounded-lg border bg-background shadow-lg"
    >
      <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
      <div className="flex items-center border-b px-3">
        <Search className="size-4 text-muted-foreground shrink-0 mr-2" />
        <Command.Input
          placeholder="Type a command or search..."
          className="flex h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <Command.List className="max-h-72 overflow-y-auto p-1">
        <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
          No results found.
        </Command.Empty>

        {/* Navigation */}
        {viewedProject && (
          <Command.Group heading="Navigation" className={groupClassName}>
            {visibleItems.map((item) => (
              <Command.Item
                key={item.id}
                value={item.label}
                onSelect={() => runAction(() => navigate(item.path(viewedProject.id)))}
                className={itemClassName}
              >
                <item.icon className="size-4 text-muted-foreground" />
                {item.label}
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {/* View Toggles */}
        {toggles && toggles.length > 0 && (
          <Command.Group heading="View" className={groupClassName}>
            {toggles.map((toggle) => (
              <Command.Item
                key={toggle.label}
                value={`Toggle ${toggle.label}`}
                keywords={[toggle.label, "toggle", "show", "hide", "panel"]}
                onSelect={() => runAction(toggle.onToggle)}
                className={itemClassName}
              >
                <toggle.icon className="size-4 text-muted-foreground" />
                <span className="flex-1">{toggle.label}</span>
                <span className="text-xs text-muted-foreground">{toggle.isVisible ? "On" : "Off"}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {/* Projects */}
        {projects && projects.length > 0 && (
          <Command.Group heading="Projects" className={groupClassName}>
            <Command.Item
              value="View All Projects"
              onSelect={() => runAction(() => navigate("/projects"))}
              className={itemClassName}
            >
              <FolderOpen className="size-4 text-muted-foreground" />
              View All Projects
            </Command.Item>
            {projects.map((project) => (
              <Command.Item
                key={project.id}
                value={`Go to ${project.name}`}
                keywords={[project.name]}
                onSelect={() => runAction(() => navigate(`/projects/${project.id}`))}
                className={itemClassName}
              >
                <FolderOpen className="size-4 text-muted-foreground" />
                <span className="flex-1 truncate">{project.name}</span>
                {project.isCurrent && (
                  <span className="text-xs text-muted-foreground">Active</span>
                )}
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {/* Actions */}
        <Command.Group heading="Actions" className={groupClassName}>
          {onConfigureProject && (
            <Command.Item
              value="Configure Project"
              onSelect={() => runAction(onConfigureProject)}
              className={itemClassName}
            >
              <Settings className="size-4 text-muted-foreground" />
              Configure Project
            </Command.Item>
          )}
          {viewedProject && isViewingActiveProject && (
            <>
              <Command.Item
                value="New Patch"
                keywords={["patch", "fixture", "add"]}
                onSelect={() => runAction(() => navigate(`/projects/${viewedProject.id}/patches?action=new`))}
                className={itemClassName}
              >
                <TableProperties className="size-4 text-muted-foreground" />
                New Patch
              </Command.Item>
              <Command.Item
                value="New FX Preset"
                keywords={["preset", "effect", "create"]}
                onSelect={() => runAction(() => navigate(`/projects/${viewedProject.id}/presets?action=new`))}
                className={itemClassName}
              >
                <Bookmark className="size-4 text-muted-foreground" />
                New FX Preset
              </Command.Item>
              <Command.Item
                value="New FX Cue"
                keywords={["cue", "effect", "create"]}
                onSelect={() => runAction(() => navigate(`/projects/${viewedProject.id}/cues/standalone?action=new`))}
                className={itemClassName}
              >
                <Clapperboard className="size-4 text-muted-foreground" />
                New FX Cue
              </Command.Item>
            </>
          )}
          <Command.Item
            value="Create New Project"
            onSelect={() => runAction(() => navigate("/projects"))}
            className={itemClassName}
          >
            <PlusCircle className="size-4 text-muted-foreground" />
            Create New Project
          </Command.Item>
        </Command.Group>
      </Command.List>

      <div className="border-t px-3 py-2 text-xs text-muted-foreground flex items-center gap-4">
        <span>
          <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">↑↓</kbd> navigate
        </span>
        <span>
          <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">↵</kbd> select
        </span>
        <span>
          <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">esc</kbd> close
        </span>
      </div>
    </Command.Dialog>
  )
}
