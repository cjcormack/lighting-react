import { type ReactNode } from 'react'
import { ChevronDown, Circle, Download, Eraser, Layers, Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { setProgrammerFade, useProgrammerFade } from '@/lib/programmerFade'
import {
  programmerClearAll,
  useProgrammerSummaryQuery,
} from '@/store/programmer'
import { useActiveEffectsQuery } from '@/store/fixtureFx'
import { useProjectCueStackListQuery } from '@/store/cueStacks'
import { includedCueId, includedTargetParts } from '@/lib/includedTarget'
import { useProgrammerSheets } from './ProgrammerSheets'

/** Fade options for Clear and for entering/leaving Blind, in milliseconds. */
const FADE_OPTIONS = [
  { value: '0', label: 'Snap' },
  { value: '500', label: '0.5s' },
  { value: '1000', label: '1s' },
  { value: '2000', label: '2s' },
  { value: '3000', label: '3s' },
]


/**
 * The programmer's verbs — **the right half of row A**.
 *
 * Brief item 2: `Clear`, fade, `Blind`, `Record`, `Record look`, `Include` and `Update` used to sit
 * in one row as seven identical `variant="outline" size="sm"` peers, so nothing distinguished what
 * *stages* from what *writes*, and "Record" and "Record look" read as a pair when they are two
 * destinations for one act. Three zones under `STAGE · LOAD · SAVE` labels fixed that, and cost a
 * whole extra text line across the page to do it.
 *
 * **The zones are gone, and the labels with them** (`ActionZone` and `Divider` are deleted).
 * Session 1 of the space plan gives the grid the page: this bar shares one 40px row with the
 * source box rather than owning a 68px band of its own, so a 9px label above every control is
 * 20px of every screen spent on a word. Nothing they said was deleted — each label now rides the
 * control it introduced, as that control's hover text:
 *
 *  - **Stage** — leading Clear's *Radix* tooltip rather than a native `title`, because Clear is the
 *    one control here already wrapped in a `TooltipTrigger` and two tooltip mechanisms answering
 *    one hover is a bug, not two explanations. It changes what the rig is doing right now. Blind
 *    used to sit here too; session 2b moved it into the `ShowBar` beside blackout, so there is one
 *    Blind in one place on every view rather than one location on the Programmer and another on
 *    Show.
 *  - **Load** — a native `title` on Include, which is not wrapped: the only way in, and the only
 *    control never disabled.
 *  - **Save** — the same, on Record: one primary button with a destination menu, unchanged.
 *
 * `Update` is not here at all — it lives inside the source box, beside the thing it writes to.
 *
 * `sheetControls` is gone too: Groups and Columns are the *grid's* tools, not the programmer's
 * verbs, and they moved to row B where the filter already was.
 *
 * Below `@[800px]` Clear keeps its fade segment and loses its word, and Include and Record become
 * their icons; every one of those carries an `aria-label` so the shrink costs a sighted operator a
 * word and a screen reader nothing. Nothing collapses into an overflow kebab — the old bar hid its
 * last four buttons behind a `MoreHorizontal` below `sm`, which put the entire point of the
 * programmer one tap further away on the surface most likely to be used standing up.
 *
 * The container queried is **row A's**, declared by the wrapper in `ProgrammerPage`; this
 * component must not declare one of its own, for the reason `ProgrammerWorkspace` documents.
 */
export function ProgrammerActionBar({ projectId }: { projectId: number }) {
  const { data: summary } = useProgrammerSummaryQuery()
  const { data: activeEffects } = useActiveEffectsQuery()
  const { data: stacks } = useProjectCueStackListQuery(projectId)
  const fadeMs = useProgrammerFade()
  const sheets = useProgrammerSheets()

  const entryCount = summary?.entryCount ?? 0
  const target = summary?.lastIncluded ?? null
  const fade = Number(fadeMs) || 0

  // Clear releases programmer values *and* programmer-band FX, and the two are independent:
  // applying a busking effect creates a band FX with no value entry behind it. Gating the button on
  // the entry count alone would leave the documented escape hatch disabled in exactly the case an
  // operator most needs it.
  const programmerFxCount = activeEffects?.filter((e) => e.programmerOwned).length ?? 0
  const hasSomethingToClear = entryCount > 0 || programmerFxCount > 0

  // Record reads the programmer, so it is meaningless when the programmer is empty. Include is
  // not: it is how you *fill* the programmer.
  const hasContent = entryCount > 0 || programmerFxCount > 0

  const cueId = includedCueId(target)
  const includedCue = target?.kind === 'CUE' ? includedTargetParts(target) : null
  const includedStack =
    target?.kind === 'CUE' && target.cueStackId != null
      ? stacks?.find((s) => s.id === target.cueStackId)
      : undefined

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Wrapped so the disabled state can still explain itself. */}
          <div className="inline-flex h-8 items-stretch overflow-hidden rounded-md border">
            <button
              type="button"
              disabled={!hasSomethingToClear}
              onClick={() => programmerClearAll(fade)}
              aria-label="Clear"
              className="inline-flex items-center gap-1.5 px-2.5 text-xs font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
            >
              <Eraser className="size-3.5" />
              <span className="hidden @[800px]:inline">Clear</span>
            </button>
            <Select value={fadeMs} onValueChange={setProgrammerFade}>
              <SelectTrigger
                size="sm"
                aria-label="Fade time"
                // Wide enough for "Snap" beside the chevron at the trigger's own padding; at 72px
                // the longest label clipped to "Sna".
                className="h-8 w-[86px] rounded-none border-0 border-l bg-muted/40 font-mono text-xs focus-visible:ring-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FADE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </TooltipTrigger>
        {/* The retired **Stage** zone label leads this tooltip rather than sitting on the button
            as a native `title`: this button is the one control here already inside a
            `TooltipTrigger`, and a `title` beside it means the browser's own balloon and Radix's
            floating card both answer one hover. Include and Record carry theirs as `title`s
            because neither is wrapped. */}
        <TooltipContent>
          {'Stage — '}
          {!hasSomethingToClear
            ? 'the programmer is empty'
            : [
                'Release',
                entryCount > 0
                  ? `${entryCount} programmer value${entryCount === 1 ? '' : 's'}`
                  : null,
                entryCount > 0 && programmerFxCount > 0 ? 'and' : null,
                programmerFxCount > 0 ? `${programmerFxCount} programmer FX` : null,
                fade > 0 ? `over ${fade / 1000}s` : null,
              ]
                .filter(Boolean)
                .join(' ')}
        </TooltipContent>
      </Tooltip>

      <Button
        variant="outline"
        size="sm"
        onClick={sheets.openInclude}
        title="Load"
        aria-label="Include…"
      >
        <Download className="size-3.5" />
        <span className="hidden @[800px]:inline">Include…</span>
      </Button>

      <div className="inline-flex h-8 shrink-0 items-stretch overflow-hidden rounded-md">
        <Button
          size="sm"
          disabled={!hasContent}
          onClick={() => sheets.openRecord()}
          title="Save"
          aria-label="Record"
          className="rounded-none px-3 font-semibold"
        >
          <Circle className="size-3 fill-current" />
          <span className="hidden @[800px]:inline">Record</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              disabled={!hasContent}
              aria-label="Record destination"
              className="rounded-none border-l border-primary-foreground/25 px-1.5"
            >
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[238px]">
            <DropdownMenuLabel className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              Write {entryCount} value{entryCount === 1 ? '' : 's'} into
            </DropdownMenuLabel>
            {cueId != null && (
              <MenuItem
                icon={<Upload className="size-3.5" />}
                title={[includedCue?.number, includedCue?.name].filter(Boolean).join(' ')}
                sub="Update the cue you are editing"
                onSelect={() =>
                  sheets.openRecord({ targetCueId: cueId, targetCueName: includedCue?.name })
                }
              />
            )}
            {includedStack && (
              <MenuItem
                icon={<Plus className="size-3.5" />}
                title={`A new cue after ${includedCue?.number ?? includedCue?.name ?? 'this one'}`}
                // NOT "becomes Q4.5": the server assigns the number, and `lib/cueNumber.ts` has
                // no between-two-numbers arithmetic. Predicting one the server then ignores is
                // worse than not predicting.
                sub={`${includedStack.name} · appended`}
                onSelect={() => sheets.openRecord({ defaultCueStackId: includedStack.id })}
              />
            )}
            <MenuItem
              icon={<Layers className="size-3.5" />}
              title="A new Look"
              sub="Names its own fixtures"
              onSelect={sheets.openRecordLook}
            />
            <DropdownMenuSeparator />
            <MenuItem
              icon={<Circle className="size-3.5" />}
              title="An existing cue…"
              sub="Pick from any stack"
              onSelect={() => sheets.openRecord()}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

function MenuItem({
  icon,
  title,
  sub,
  onSelect,
}: {
  icon: ReactNode
  title: string
  sub: string
  onSelect: () => void
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} className="flex items-start gap-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-xs font-medium">{title}</span>
        <span className="truncate text-[10.5px] text-muted-foreground">{sub}</span>
      </span>
    </DropdownMenuItem>
  )
}
