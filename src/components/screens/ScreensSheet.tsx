import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Maximize2, Minimize2, MonitorUp } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { DeskWindow } from '@/api/windowsApi'
import { canFullscreen, enterFullscreen, exitFullscreen, useFullscreenState } from '@/lib/fullscreen'
import { windowId } from '@/lib/windowIdentity'
import {
  canChooseDisplay,
  isLoopbackHost,
  listDisplays,
  newWindowUrl,
  nextScreenName,
  openWindowOn,
  type DisplayChoice,
} from '@/lib/screens'
import { WINDOW_VIEWS, projectIdOfPath, windowViewOf, windowViewPath } from '@/lib/windowViews'
import { useViewedProject } from '@/ProjectSwitcher'
import {
  renameWindowRow,
  setWindowFullscreen,
  showOnWindow,
  thisWindowRow,
  useDeskWindows,
} from '@/store/windows'
import { setScreensSheetOpen, useScreensSheetOpen } from './screensSheetState'

/**
 * **Screens** — every window signed in to this desk, and the controls to change what one shows
 * from any of the others (multi-screen plan §4; `Screens.dc.html` §2 is the authority on layout
 * and copy). Mounted once in `Layout`; opened from the user menu and from ⌘K through
 * `screensSheetState`.
 *
 * One row per registry row: an editable name, *this window*, full screen or in a browser tab,
 * follows the desk or not, a view picker over the six views, and a Full screen / Exit full screen
 * button. Every write is a `windows.*` command by **row id** — this window's included, so a rename
 * of this tab goes out and comes back like any other and there is one path, not two. The one
 * thing read locally is this window's own full-screen state, which `fullscreenchange` knows before
 * the registry does.
 *
 * Below the rows, the two ways to make a new window:
 *
 * - **Open a window on… Display N** is Chrome's Window Management API, secure context only, and
 *   is drawn only behind `'getScreenDetails' in window` (D13: absent, not disabled — Safari has no
 *   equivalent and the operator opens the window by hand). The permission prompt is Chrome's, on
 *   the first *Choose a display*. The child is opened with `noopener`, which puts it in a new
 *   browsing-context group rather than an auxiliary one, so it does **not** inherit this tab's
 *   `sessionStorage`; the `?window=` on its URL names it (D10). That is the spec's promise and it
 *   is belt *and* braces: `lib/windowIdentity.ts` mints a fresh `windowId` whenever the parameter
 *   is present at boot, so a route that *does* clone — a `target=_blank` link, another browser —
 *   still gets its own **`windowId`**. Its *name* is not covered, and "identity" is the pair: a
 *   stored name beats the parameter, so a cloned child keeps the opener's name and this sheet
 *   would list a second *Screen 1* rather than the *Screen 2* that was asked for. Only the id is
 *   the misattribution vector, and only the id is fixed — two rows sharing a name is what D9
 *   already accepts.
 * - **Copy link for another device** mints `<origin>/?window=<name>` with the space as `%20`,
 *   matching the launcher's tray items. The origin is this tab's: the desk mints its LAN address
 *   server-side per request (`auth/ResetUrls.kt`) and exposes it on no GET route, so a tab open at
 *   `localhost` copies a link that names the desk to itself — said under the button rather than
 *   guessed at (`FU-SCREENS-LAN-URL`).
 *
 * The row's server-stamped `user` is drawn only where two rows share a name, which is the one
 * time it disambiguates anything. **Layouts** is `FU-SCREENS-LAYOUTS`, not built.
 */
export function ScreensSheet() {
  const open = useScreensSheetOpen()
  return (
    <Sheet open={open} onOpenChange={setScreensSheetOpen}>
      <SheetContent className="flex flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Screens</SheetTitle>
          <SheetDescription>
            Every window signed in to this desk. Change what one shows from any of the others.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>{open && <ScreensSheetBody />}</SheetBody>
        <SheetFooter className="flex-row justify-end gap-2">
          <SheetClose asChild>
            <Button variant="outline">Close</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function ScreensSheetBody() {
  const windows = useDeskWindows()
  // One answer to "which row is this window", shared with the desk chip and ⌘K: the first row
  // carrying this tab's windowId. A duplicated tab then badges one twin, not both.
  const meRowId = thisWindowRow(windows, windowId())?.id ?? null
  const viewedProject = useViewedProject()
  const fallbackProjectId = viewedProject?.id ?? null
  const duplicateNames = useMemo(() => {
    const seen = new Map<string, number>()
    for (const w of windows) seen.set(w.name, (seen.get(w.name) ?? 0) + 1)
    return new Set([...seen].filter(([, n]) => n > 1).map(([name]) => name))
  }, [windows])
  const nextName = useMemo(() => nextScreenName(windows.map((w) => w.name)), [windows])

  return (
    <>
      {windows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No windows yet — this one appears once the desk has heard from it.
        </p>
      ) : (
        <ul className="space-y-3" aria-label="Windows">
          {windows.map((row) => (
            <WindowRow
              key={row.id}
              row={row}
              isMe={row.id === meRowId}
              showUser={duplicateNames.has(row.name)}
              fallbackProjectId={fallbackProjectId}
            />
          ))}
        </ul>
      )}
      <NewWindowSection defaultName={nextName} />
    </>
  )
}

function WindowRow({
  row,
  isMe,
  showUser,
  fallbackProjectId,
}: {
  row: DeskWindow
  isMe: boolean
  showUser: boolean
  fallbackProjectId: number | null
}) {
  const local = useFullscreenState()
  const fullscreen = isMe ? local.active : row.fullscreen
  const view = windowViewOf(row.view)
  const projectId = projectIdOfPath(row.view) ?? fallbackProjectId
  const fullscreenAvailable = !isMe || canFullscreen()

  const onPickView = (id: string) => {
    const next = WINDOW_VIEWS.find((v) => v.id === id)
    if (next == null || projectId == null) return
    showOnWindow(row.id, windowViewPath(next, projectId))
  }

  const onFullscreen = () => {
    if (isMe) {
      if (fullscreen) void exitFullscreen()
      else void enterFullscreen()
    } else {
      setWindowFullscreen(row.id, !fullscreen)
    }
  }

  return (
    <li className="rounded-md border p-3" aria-label={row.name}>
      <div className="flex items-center gap-2">
        <NameField row={row} />
        {isMe && (
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            this window
          </Badge>
        )}
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {fullscreen ? 'full screen' : 'in a browser tab'} ·{' '}
        {row.follows ? 'follows the desk' : 'own selection'}
        {showUser && row.user != null && ` · ${row.user}`}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Select value={view?.id ?? ''} onValueChange={onPickView} disabled={projectId == null}>
          <SelectTrigger
            className="h-8 flex-1"
            aria-label={`View on ${row.name}`}
            title={projectId == null ? 'No project to show a view in' : undefined}
          >
            <SelectValue placeholder={view == null ? row.view : undefined} />
          </SelectTrigger>
          <SelectContent>
            {WINDOW_VIEWS.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fullscreenAvailable && (
          <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={onFullscreen}>
            {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            {fullscreen ? 'Exit full screen' : 'Full screen'}
          </Button>
        )}
      </div>
    </li>
  )
}

/** The name, edited in place: committed on ⏎ or blur, reverted on Escape, a blank reverted too. */
function NameField({ row }: { row: DeskWindow }) {
  const [draft, setDraft] = useState(row.name)
  useEffect(() => setDraft(row.name), [row.name])

  const commit = () => {
    const name = draft.trim()
    if (name === '' || name === row.name) {
      setDraft(row.name)
      return
    }
    renameWindowRow(row.id, name)
  }

  return (
    <Input
      value={draft}
      aria-label={`Name of ${row.name}`}
      className="h-8 flex-1 font-medium"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          // The blur commits — the field is focused whenever Enter reaches it. Committing here
          // as well sent two identical renames, since `row.name` has not round-tripped yet.
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setDraft(row.name)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

function NewWindowSection({ defaultName }: { defaultName: string }) {
  const [name, setName] = useState(defaultName)
  const [displays, setDisplays] = useState<DisplayChoice[] | null>(null)
  const [copied, setCopied] = useState(false)
  const url = newWindowUrl(name || defaultName)
  const loopback = isLoopbackHost(window.location.hostname)

  const chooseDisplay = async () => {
    try {
      setDisplays(await listDisplays())
    } catch {
      toast.error('The browser did not allow reading the displays')
    }
  }

  const openOn = (display: DisplayChoice) => {
    openWindowOn(display, url)
    // The name is spent: clear it so the next open takes the registry's next free *Screen N*
    // (the placeholder already shows it) rather than naming a second window the same thing.
    setName('')
    setCopied(false)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      toast.error('Could not copy — the link is below to select')
    }
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="space-y-1.5">
        <Label htmlFor="new-window-name">Name for a new window</Label>
        <Input
          id="new-window-name"
          value={name}
          placeholder={defaultName}
          className="h-8"
          onChange={(e) => {
            setName(e.target.value)
            setCopied(false)
          }}
        />
      </div>

      {canChooseDisplay() && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Open a window on…</p>
          {displays == null ? (
            <Button variant="outline" size="sm" className="h-8" onClick={() => void chooseDisplay()}>
              <MonitorUp className="size-4" />
              Choose a display
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              {displays.map((d) => (
                <Button key={d.label} variant="outline" size="sm" className="h-8" onClick={() => openOn(d)}>
                  <MonitorUp className="size-4" />
                  {d.label}
                  {d.isCurrent && <span className="text-muted-foreground"> · this display</span>}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Button variant="outline" size="sm" className="h-8" onClick={() => void copy()}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? 'Copied' : 'Copy link for another device'}
        </Button>
        <p className="break-all text-xs text-muted-foreground select-all">{url}</p>
        {loopback && (
          <p className="text-xs text-muted-foreground">
            This tab is open at {window.location.hostname}, which names the desk to itself; on
            another device use the desk’s LAN address with the same <code>?window=</code>.
          </p>
        )}
      </div>
    </div>
  )
}
