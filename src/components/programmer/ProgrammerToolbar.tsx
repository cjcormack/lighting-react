import { Circle, Download, Eraser, EyeOff, MoreHorizontal, Upload } from 'lucide-react'
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
 * The Record / Include / Update loop, still to come. Declared once so the inline row and the
 * narrow-viewport overflow menu can't drift apart.
 */
const SESSION_3_ACTIONS = [
  { label: 'Record', Icon: Circle },
  { label: 'Include', Icon: Download },
  { label: 'Update', Icon: Upload },
] as const

/**
 * The programmer's own controls, rendered ahead of the shared list toolbar (which already
 * carries Locate, Highlight and Fan for the current selection).
 *
 * Record / Include / Update are Session 3 of the redesign and render disabled here rather
 * than being omitted: the shape of the loop is part of what the sheet teaches, and a missing
 * button reads as "not supported" where a disabled one reads as "not yet".
 */
export function ProgrammerToolbar() {
  const { data: summary } = useProgrammerSummaryQuery()
  const [fadeMs, setFadeMs] = usePersistentState<string>(FADE_KEY, '0')

  const blind = summary?.blind ?? false
  const entryCount = summary?.entryCount ?? 0
  const fade = Number(fadeMs) || 0

  // Clear releases programmer values *and* programmer-band FX, and the two are independent:
  // applying a busking effect creates a band FX with no value entry behind it. Gating the
  // button on the entry count alone would leave the documented escape hatch disabled in
  // exactly the case an operator most needs it.
  const { data: activeEffects } = useActiveEffectsQuery()
  const programmerFxCount = activeEffects?.filter((e) => e.programmerOwned).length ?? 0
  const hasSomethingToClear = entryCount > 0 || programmerFxCount > 0

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

      {/* Session 3 — Record / Include / Update.
          Inline above `sm`; below it they collapse into the overflow menu rather than
          disappearing, so the loop the programmer is built around stays discoverable on a
          phone instead of looking like it doesn't exist. */}
      <div className="hidden items-center gap-2 sm:flex">
        <div className="mx-1 h-5 w-px bg-border" />
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2">
              {SESSION_3_ACTIONS.map(({ label, Icon }) => (
                <Button key={label} variant="outline" size="sm" disabled>
                  <Icon className="size-3.5" />
                  {label}
                </Button>
              ))}
            </div>
          </TooltipTrigger>
          <TooltipContent>Record / Include / Update land in a later session</TooltipContent>
        </Tooltip>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="sm:hidden" aria-label="More actions">
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Available in a later session
          </DropdownMenuLabel>
          {SESSION_3_ACTIONS.map(({ label, Icon }) => (
            <DropdownMenuItem key={label} disabled>
              <Icon className="size-3.5" />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
