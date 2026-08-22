import { useState } from 'react'
import { useParams } from 'react-router'
import {
  Circle,
  Download,
  Eraser,
  EyeOff,
  MoreHorizontal,
  SwatchBook,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { usePersistentState } from '../../hooks/usePersistentState'
import {
  programmerClearAll,
  programmerSetBlind,
  useProgrammerSummaryQuery,
} from '../../store/programmer'
import { useActiveEffectsQuery } from '../../store/fixtureFx'
import { IncludeSheet } from './IncludeSheet'
import { RecordSheet } from './RecordSheet'
import { RecordLookSheet } from './RecordLookSheet'
import { UpdateDialog } from './UpdateDialog'
import { describeIncludedTarget } from '@/lib/includedTarget'

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
 * The programmer's own controls, rendered ahead of the shared list toolbar (which already
 * carries Locate, Highlight and Fan for the current selection).
 */
export function ProgrammerToolbar() {
  const { data: summary } = useProgrammerSummaryQuery()
  const [fadeMs, setFadeMs] = usePersistentState<string>(FADE_KEY, '0')
  const { projectId: projectIdParam } = useParams()
  const projectId = Number(projectIdParam)

  const [recordOpen, setRecordOpen] = useState(false)
  const [recordLookOpen, setRecordLookOpen] = useState(false)
  const [includeOpen, setIncludeOpen] = useState(false)
  const [updateOpen, setUpdateOpen] = useState(false)

  const blind = summary?.blind ?? false
  const entryCount = summary?.entryCount ?? 0
  const includeTarget = summary?.lastIncluded ?? null
  const fade = Number(fadeMs) || 0

  // Clear releases programmer values *and* programmer-band FX, and the two are independent:
  // applying a busking effect creates a band FX with no value entry behind it. Gating the
  // button on the entry count alone would leave the documented escape hatch disabled in
  // exactly the case an operator most needs it.
  const { data: activeEffects } = useActiveEffectsQuery()
  const programmerFxCount = activeEffects?.filter((e) => e.programmerOwned).length ?? 0
  const hasSomethingToClear = entryCount > 0 || programmerFxCount > 0

  // Record and Update both read the programmer, so both are meaningless when it is empty.
  // Include is not: it is how you *fill* the programmer.
  const hasContent = entryCount > 0 || programmerFxCount > 0

  const actions = [
    {
      label: 'Record',
      Icon: Circle,
      disabled: !hasContent || !projectId,
      tooltip: hasContent
        ? 'Write the programmer into a cue'
        : 'The programmer is empty — nothing to record',
      onSelect: () => setRecordOpen(true),
    },
    {
      label: 'Record look',
      Icon: SwatchBook,
      disabled: !hasContent || !projectId,
      tooltip: hasContent
        ? 'Write the programmer into a look that names its own fixtures'
        : 'The programmer is empty — nothing to record',
      onSelect: () => setRecordLookOpen(true),
    },
    {
      label: 'Include',
      Icon: Download,
      disabled: !projectId,
      tooltip: 'Load a cue or a look into the programmer to edit it',
      onSelect: () => setIncludeOpen(true),
    },
    {
      label: 'Update',
      Icon: Upload,
      // A Look target is writable now: `updateIncludedLook` MERGEs whatever changed since Include
      // into the Look's own rows, so Include → edit → Update is a round trip for a look exactly as
      // it is for a cue. It used to be disabled here, because the only write-back path led into the
      // retired palette tables.
      disabled: !hasContent || !projectId,
      tooltip: includeTarget
        ? `Write your changes back into ${describeIncludedTarget(includeTarget)}`
        : hasContent
          ? 'Show the cues the programmer is overriding'
          : 'The programmer is empty — nothing to update',
      onSelect: () => setUpdateOpen(true),
    },
    // A programmer-wide "Make hard" stood here, disabled rather than hidden so the escape hatch
    // was discoverable before you needed it. It stopped the programmer's `ref:` slots tracking
    // their palettes; with the grammar retired the programmer holds nothing but literals, so
    // there is nothing to harden. Detaching a *cue* from the library is the flatten-layer route.
  ] as const

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasSomethingToClear}
            onClick={() => programmerClearAll(fade)}
          >
            <Eraser className="size-3.5" />
            Clear
          </Button>
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
                programmerFxCount > 0
                  ? `${programmerFxCount} programmer FX`
                  : null,
                fade > 0 ? `over ${fade / 1000}s` : null,
              ]
                .filter(Boolean)
                .join(' ')}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          {/* Wrapped: a Radix SelectTrigger can't also be a TooltipTrigger child. */}
          <div>
            <Select value={fadeMs} onValueChange={setFadeMs}>
              <SelectTrigger size="sm" className="h-8 w-[84px] sm:w-[92px]" aria-label="Fade time">
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
          Fade time for Clear and Blind. Properties an effect covers snap on the next tick
          regardless — a 50&nbsp;Hz effect would overwrite the ramp mid-flight.
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
            ? 'Blind is on — edits are staged, the stage keeps playing the layers below. Click to land them.'
            : 'Build a look without it reaching the stage'}
        </TooltipContent>
      </Tooltip>

      {/* Record / Include / Update.
          Inline above `sm`; below it they collapse into the overflow menu rather than
          disappearing, so the loop the programmer is built around stays discoverable on a
          phone instead of looking like it doesn't exist. */}
      <div className="hidden items-center gap-2 sm:flex">
        <div className="mx-1 h-5 w-px bg-border" />
        {actions.map(({ label, Icon, disabled, tooltip, onSelect }) => (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              {/* Wrapped: a disabled button emits no pointer events, so the tooltip needs a
                  live element to hang off — otherwise the "why is this off?" hint never
                  appears, which is exactly when it's wanted. */}
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={onSelect}
                >
                  <Icon className="size-3.5" />
                  {label}
                </Button>
              </div>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="sm:hidden" aria-label="More actions">
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Programmer
          </DropdownMenuLabel>
          {actions.map(({ label, Icon, disabled, onSelect }) => (
            <DropdownMenuItem key={label} disabled={disabled} onSelect={onSelect}>
              <Icon className="size-3.5" />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {projectId > 0 && (
        <>
          <RecordSheet open={recordOpen} onOpenChange={setRecordOpen} projectId={projectId} />
          <RecordLookSheet
            open={recordLookOpen}
            onOpenChange={setRecordLookOpen}
            projectId={projectId}
          />
          <IncludeSheet
            open={includeOpen}
            onOpenChange={setIncludeOpen}
            projectId={projectId}
          />
          <UpdateDialog
            open={updateOpen}
            onOpenChange={setUpdateOpen}
            projectId={projectId}
            includeTarget={includeTarget}
          />
        </>
      )}
    </div>
  )
}
