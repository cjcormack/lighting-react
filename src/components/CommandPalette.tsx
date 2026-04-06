import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Command } from "cmdk"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import {
  Settings, FolderOpen, PlusCircle, Search, TableProperties, Bookmark,
  Clapperboard, AudioWaveform, LayoutGrid, Layers, ArrowLeft, Lock, LockOpen,
  SlidersHorizontal,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useProjectListQuery, useCurrentProjectQuery } from "@/store/projects"
import { useFixtureListQuery, type Fixture } from "@/store/fixtures"
import { useGroupListQuery } from "@/store/groups"
import type { GroupSummary } from "@/api/groupsApi"
import { useNavItems, filterNavItems } from "@/navigation"
import { useViewedProject } from "@/ProjectSwitcher"
import type { FxTarget } from "@/components/fx/AddEditFxSheet"
import { useGetParkStateListQuery, useUnparkAllMutation, useUnparkChannelMutation } from "@/store/park"
import { useGetChannelMappingListQuery } from "@/store/channelMapping"

export interface ToggleState {
  label: string
  icon: LucideIcon
  isVisible: boolean
  onToggle: () => void
}

interface CommandPaletteProps {
  onConfigureProject?: () => void
  onApplyFx?: (target: FxTarget) => void
  onParkChannelAtValue?: () => void
  onSetChannelValue?: () => void
  toggles?: ToggleState[]
}

const itemClassName =
  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer aria-selected:bg-accent aria-selected:text-accent-foreground"

const groupClassName =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"

function formatDmxAddress(universe: number, firstChannel: number): string {
  return `${universe}-${String(firstChannel).padStart(3, "0")}`
}

function fixtureKeywords(fixture: Fixture): string[] {
  return [fixture.name, fixture.manufacturer, fixture.model, ...(fixture.groups ?? [])].filter(
    (s): s is string => !!s
  )
}

// ─── Search filter ────────────────────────────────────────────────────────

function commandFilter(value: string, search: string, keywords?: string[]): number {
  const needle = search.toLowerCase()
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
  if (matchWordPrefixes(needle, words, 0, 0)) return 0.7
  const initials = words.map((w) => w[0] ?? "").join("")
  if (initials.includes(needle)) return 0.6
  return 0
}

function matchWordPrefixes(needle: string, words: string[], needleIdx: number, wordIdx: number): boolean {
  if (needleIdx >= needle.length) return true
  if (wordIdx >= words.length) return false
  const word = words[wordIdx]
  if (matchWordPrefixes(needle, words, needleIdx, wordIdx + 1)) return true
  for (let take = 1; take <= word.length && needleIdx + take <= needle.length; take++) {
    if (word[take - 1] !== needle[needleIdx + take - 1]) break
    if (matchWordPrefixes(needle, words, needleIdx + take, wordIdx + 1)) return true
  }
  return false
}

// ─── Shared list items ────────────────────────────────────────────────────

function FixtureItem({ fixture, onSelect }: { fixture: Fixture; onSelect: () => void }) {
  return (
    <Command.Item
      key={fixture.key}
      value={`fixture-${fixture.key}`}
      keywords={fixtureKeywords(fixture)}
      onSelect={onSelect}
      className={itemClassName}
    >
      <LayoutGrid className="size-4 text-muted-foreground" />
      <span className="flex-1 truncate">{fixture.name}</span>
      <span className="text-xs text-muted-foreground truncate max-w-[200px]">
        {[fixture.model, formatDmxAddress(fixture.universe, fixture.firstChannel)].filter(Boolean).join(" · ")}
      </span>
    </Command.Item>
  )
}

function GroupItem({ group, onSelect }: { group: GroupSummary; onSelect: () => void }) {
  return (
    <Command.Item
      key={group.name}
      value={`Group ${group.name}`}
      keywords={[group.name, ...group.capabilities]}
      onSelect={onSelect}
      className={itemClassName}
    >
      <Layers className="size-4 text-muted-foreground" />
      <span className="flex-1 truncate">{group.name}</span>
      <span className="text-xs text-muted-foreground">
        {group.memberCount} fixture{group.memberCount !== 1 ? "s" : ""}
      </span>
    </Command.Item>
  )
}

// ─── Main component ───────────────────────────────────────────────────────

export default function CommandPalette({ onConfigureProject, onApplyFx, onParkChannelAtValue, onSetChannelValue, toggles }: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const [pages, setPages] = useState<string[]>([])
  const [search, setSearch] = useState("")
  const navigate = useNavigate()
  const { data: projects } = useProjectListQuery()
  const { data: currentProject } = useCurrentProjectQuery()
  const { data: fixtures } = useFixtureListQuery()
  const { data: groups } = useGroupListQuery()
  const allNavItems = useNavItems()

  const { data: parkStateList } = useGetParkStateListQuery()
  const [runUnparkAll] = useUnparkAllMutation()
  const [runUnparkChannel] = useUnparkChannelMutation()
  const { data: channelMappings } = useGetChannelMappingListQuery()
  const parkedCount = parkStateList?.length ?? 0

  const viewedProject = useViewedProject()
  const isViewingActiveProject = viewedProject?.id === currentProject?.id
  const visibleItems = filterNavItems(allNavItems, isViewingActiveProject)

  const activePage = pages[pages.length - 1] ?? "root"

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

  // Reset state when dialog closes
  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next)
    if (!next) {
      setPages([])
      setSearch("")
    }
  }, [])

  const runAction = (fn: () => void) => {
    handleOpenChange(false)
    fn()
  }

  const pushPage = (page: string) => {
    setPages((p) => [...p, page])
    setSearch("")
  }

  const popPage = () => {
    setPages((p) => p.slice(0, -1))
    setSearch("")
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={handleOpenChange}
      label="Command palette"
      filter={commandFilter}
      loop
      overlayClassName="fixed inset-0 z-50 bg-black/50"
      contentClassName="fixed top-[20%] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 rounded-lg border bg-background shadow-lg"
    >
      <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
      <div className="flex items-center border-b px-3">
        {activePage !== "root" && (
          <button onClick={popPage} className="mr-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
          </button>
        )}
        <Search className="size-4 text-muted-foreground shrink-0 mr-2" />
        <Command.Input
          placeholder={
            activePage === "apply-fx" ? "Select a fixture or group..."
            : activePage === "unpark-channel" ? "Select a channel to unpark..."
            : "Type a command or search..."
          }
          value={search}
          onValueChange={setSearch}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !search && activePage !== "root") {
              e.preventDefault()
              popPage()
            }
          }}
          className="flex h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <Command.List className="max-h-72 overflow-y-auto p-1">
        <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
          No results found.
        </Command.Empty>

        {activePage === "root" && (
          <>
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
                  {onApplyFx && (
                    <Command.Item
                      value="Apply FX"
                      keywords={["effect", "fixture", "group"]}
                      onSelect={() => pushPage("apply-fx")}
                      className={itemClassName}
                    >
                      <AudioWaveform className="size-4 text-muted-foreground" />
                      Apply FX...
                    </Command.Item>
                  )}
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
              {viewedProject && isViewingActiveProject && parkedCount > 0 && (
                <>
                  <Command.Item
                    value="View Parked Channels"
                    keywords={["park", "locked", "channels", "override"]}
                    onSelect={() => {
                      const firstUniverse = parkStateList?.[0]?.universe ?? 0
                      runAction(() => navigate(`/projects/${viewedProject.id}/channels/${firstUniverse}?parked=true`))
                    }}
                    className={itemClassName}
                  >
                    <Lock className="size-4 text-muted-foreground" />
                    <span className="flex-1">View Parked Channels</span>
                    <span className="text-xs text-muted-foreground">{parkedCount}</span>
                  </Command.Item>
                  <Command.Item
                    value="Unpark Channel"
                    keywords={["unpark", "unlock", "release", "channel"]}
                    onSelect={() => pushPage("unpark-channel")}
                    className={itemClassName}
                  >
                    <LockOpen className="size-4 text-muted-foreground" />
                    Unpark Channel...
                  </Command.Item>
                  <Command.Item
                    value="Unpark All Channels"
                    keywords={["unpark", "unlock", "clear", "release"]}
                    onSelect={() => {
                      if (confirm(`Unpark all ${parkedCount} channel(s)?`)) {
                        runAction(() => runUnparkAll())
                      }
                    }}
                    className={itemClassName}
                  >
                    <LockOpen className="size-4 text-muted-foreground" />
                    Unpark All Channels
                  </Command.Item>
                </>
              )}
              {viewedProject && isViewingActiveProject && onParkChannelAtValue && (
                <Command.Item
                  value="Park Channel at Value"
                  keywords={["park", "lock", "channel", "set", "override"]}
                  onSelect={() => runAction(onParkChannelAtValue)}
                  className={itemClassName}
                >
                  <Lock className="size-4 text-muted-foreground" />
                  Park Channel at Value...
                </Command.Item>
              )}
              {viewedProject && isViewingActiveProject && onSetChannelValue && (
                <Command.Item
                  value="Set Channel Value"
                  keywords={["channel", "set", "dmx", "level"]}
                  onSelect={() => runAction(onSetChannelValue)}
                  className={itemClassName}
                >
                  <SlidersHorizontal className="size-4 text-muted-foreground" />
                  Set Channel Value...
                </Command.Item>
              )}
            </Command.Group>

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

            {/* Fixtures & Groups */}
            {isViewingActiveProject && (fixtures?.length || groups?.length) ? (
              <Command.Group heading="Fixtures & Groups" className={groupClassName}>
                {fixtures?.map((fixture) => (
                  <FixtureItem
                    key={fixture.key}
                    fixture={fixture}
                    onSelect={() => runAction(() => navigate(`/projects/${viewedProject!.id}/fixtures`))}
                  />
                ))}
                {groups?.map((group) => (
                  <GroupItem
                    key={group.name}
                    group={group}
                    onSelect={() => runAction(() => navigate(`/projects/${viewedProject!.id}/groups`))}
                  />
                ))}
              </Command.Group>
            ) : null}

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
          </>
        )}

        {/* Apply FX sub-page: pick a fixture or group */}
        {activePage === "apply-fx" && (
          <>
            {fixtures && fixtures.length > 0 && (
              <Command.Group heading="Fixtures" className={groupClassName}>
                {fixtures.map((fixture) => (
                  <FixtureItem
                    key={fixture.key}
                    fixture={fixture}
                    onSelect={() => {
                      if (onApplyFx) runAction(() => onApplyFx({ type: "fixture", fixture }))
                    }}
                  />
                ))}
              </Command.Group>
            )}
            {groups && groups.length > 0 && (
              <Command.Group heading="Groups" className={groupClassName}>
                {groups.map((group) => (
                  <GroupItem
                    key={group.name}
                    group={group}
                    onSelect={() => {
                      if (onApplyFx) runAction(() => onApplyFx({ type: "group", group }))
                    }}
                  />
                ))}
              </Command.Group>
            )}
          </>
        )}

        {/* Unpark Channel sub-page: list parked channels */}
        {activePage === "unpark-channel" && parkStateList && parkStateList.length > 0 && (
          <Command.Group heading="Parked Channels" className={groupClassName}>
            {parkStateList.map((parked) => {
              const mapping = channelMappings?.[parked.universe]?.[parked.channel]
              const label = mapping
                ? `${mapping.fixtureName}${mapping.description ? ` · ${mapping.description}` : ""}`
                : "Unmapped"
              return (
                <Command.Item
                  key={`${parked.universe}:${parked.channel}`}
                  value={`${parked.universe}-${parked.channel} ${label}`}
                  keywords={[String(parked.channel), mapping?.fixtureName ?? "", mapping?.description ?? ""]}
                  onSelect={() => runAction(() => runUnparkChannel({ universe: parked.universe, channelNo: parked.channel }))}
                  className={itemClassName}
                >
                  <LockOpen className="size-4 text-muted-foreground" />
                  <span className="flex-1 truncate">
                    <span className="font-mono text-xs">{parked.universe}-{String(parked.channel).padStart(3, "0")}</span>
                    {" "}
                    <span className="text-muted-foreground">{label}</span>
                  </span>
                  <span className="text-xs text-amber-500 font-mono">{parked.value}</span>
                </Command.Item>
              )
            })}
          </Command.Group>
        )}

      </Command.List>

      <div className="border-t px-3 py-2 text-xs text-muted-foreground flex items-center gap-4">
        <span>
          <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">↑↓</kbd> navigate
        </span>
        <span>
          <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">↵</kbd> select
        </span>
        {activePage !== "root" && (
          <span>
            <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">⌫</kbd> back
          </span>
        )}
        <span>
          <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">esc</kbd> close
        </span>
      </div>
    </Command.Dialog>
  )
}
