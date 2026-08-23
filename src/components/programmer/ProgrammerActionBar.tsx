import { type ReactNode } from 'react'
import { ChevronDown, Circle, Download, Eraser, EyeOff, Layers, Plus, Upload } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { usePersistentState } from '@/hooks/usePersistentState'
import {
  programmerClearAll,
  programmerSetBlind,
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

const FADE_KEY = 'programmer.fadeMs'

/**
 * The programmer's verbs, in three labelled zones.
 *
 * Brief item 2: `Clear`, fade, `Blind`, `Record`, `Record look`, `Include` and `Update` used to sit
 * in one row as seven identical `variant="outline" size="sm"` peers, so nothing distinguished what
 * *stages* from what *writes*, and "Record" and "Record look" read as a pair when they are two
 * destinations for one act. Now:
 *
 *  - **Stage** changes what the rig is doing right now.
 *  - **Load** is the only way in, and the only control never disabled.
 *  - **Save** is one primary button with a destination menu.
 *
 * `Update` is not here at all — it moved onto the source strip, beside the thing it writes to.
 *
 * Nothing collapses into an overflow kebab. The old bar hid its last four buttons behind a
 * `MoreHorizontal` below `sm`, which put the entire point of the programmer one tap further away on
 * the surface most likely to be used standing up; these wrap instead.
 */
export function ProgrammerActionBar({
  projectId,
  sheetControls,
}: {
  projectId: number
  /** The grid's own Groups / Columns controls, hosted here rather than above the grid. */
  sheetControls?: ReactNode
}) {
  const { data: summary } = useProgrammerSummaryQuery()
  const { data: activeEffects } = useActiveEffectsQuery()
  const { data: stacks } = useProjectCueStackListQuery(projectId)
  const [fadeMs, setFadeMs] = usePersistentState<string>(FADE_KEY, '0')
  const sheets = useProgrammerSheets()

  const blind = summary?.blind ?? false
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
    <div className="@container flex flex-wrap items-center gap-3 border-b bg-card/50 px-4 py-2">
      <ActionZone label="Stage">
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Wrapped so the disabled state can still explain itself. */}
            <div className="inline-flex h-8 items-stretch overflow-hidden rounded-md border">
              <button
                type="button"
                disabled={!hasSomethingToClear}
                onClick={() => programmerClearAll(fade)}
                className="inline-flex items-center gap-1.5 px-2.5 text-xs font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
              >
                <Eraser className="size-3.5" />
                Clear
              </button>
              <Select value={fadeMs} onValueChange={setFadeMs}>
                <SelectTrigger
                  size="sm"
                  aria-label="Fade time"
                  className="h-8 w-[72px] rounded-none border-0 border-l bg-muted/40 font-mono text-xs focus-visible:ring-0"
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
          <TooltipContent>
            {!hasSomethingToClear
              ? 'The programmer is empty'
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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={blind ? 'default' : 'outline'}
              size="sm"
              aria-pressed={blind}
              onClick={() => programmerSetBlind(!blind, fade)}
              className={cn(blind && 'bg-amber-500 text-white hover:bg-amber-600')}
            >
              <EyeOff className="size-3.5" />
              Blind
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {blind
              ? 'Blind is on — programmer values are gated out of the stage output'
              : 'Edit without the rig showing it — the programmer is gated out of the stage output'}
          </TooltipContent>
        </Tooltip>
      </ActionZone>

      <Divider />

      <ActionZone label="Load">
        <Button variant="outline" size="sm" onClick={sheets.openInclude}>
          <Download className="size-3.5" />
          Include…
        </Button>
      </ActionZone>

      <Divider />

      <ActionZone label="Save">
        <div className="inline-flex h-8 items-stretch overflow-hidden rounded-md">
          <Button
            size="sm"
            disabled={!hasContent}
            onClick={() => sheets.openRecord()}
            className="rounded-none px-3 font-semibold"
          >
            <Circle className="size-3 fill-current" />
            Record
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
      </ActionZone>

      {sheetControls && (
        <>
          <span className="flex-1" />
          <ActionZone label="Sheet">{sheetControls}</ActionZone>
        </>
      )}
    </div>
  )
}

/** One labelled group of controls. The label is what makes staging and writing tell apart. */
function ActionZone({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[8.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

/** Hidden below the wrap point, where the zone labels already do the separating. */
function Divider() {
  return <span className="hidden w-px self-stretch bg-border @[560px]:block" />
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
