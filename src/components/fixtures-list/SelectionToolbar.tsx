import { useCallback } from 'react'
import { Crosshair, Flashlight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useLocateStateQuery, useToggleLocateMutation } from '../../store/locate'
import { FanPopover } from './FanPopover'
import { useHighlight } from './useHighlight'
import type { LocateTarget } from '../../store/locate'
import type { Fixture } from '../../store/fixtures'

export interface SelectionToolbarProps {
  /** Selected rows as locate targets (groups stay groups — the backend
   *  handles their members natively). */
  locateTargets: readonly LocateTarget[]
  /** Distinct fixtures the selection expands to, in visible row order. */
  fixtures: readonly Fixture[]
  onClear: () => void
}

export function SelectionToolbar({ locateTargets, fixtures, onClear }: SelectionToolbarProps) {
  const { data: locateState } = useLocateStateQuery()
  const [toggleLocate] = useToggleLocateMutation()
  const getFixtures = useCallback(() => [...fixtures], [fixtures])
  const highlight = useHighlight(getFixtures)

  const isActive = (target: LocateTarget) =>
    locateState?.targets.some((t) => t.type === target.type && t.key === target.key) ?? false
  const allLocated = locateTargets.length > 0 && locateTargets.every(isActive)

  // All located → release everything; otherwise light up the ones not yet on.
  const locateSelection = () => {
    const toToggle = allLocated ? locateTargets : locateTargets.filter((t) => !isActive(t))
    for (const target of toToggle) {
      toggleLocate(target)
        .unwrap()
        .catch((err) => console.error(`Locate toggle failed for ${target.type} '${target.key}'`, err))
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground tabular-nums">
        {fixtures.length} fixture{fixtures.length === 1 ? '' : 's'} selected
      </span>
      <FanPopover fixtures={fixtures} />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={allLocated ? 'default' : 'outline'}
            size="sm"
            onClick={locateSelection}
            className={allLocated ? 'bg-sky-500 text-white hover:bg-sky-600' : ''}
          >
            <Crosshair className="size-3.5" />
            Locate
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {allLocated ? 'Release locate on the selection' : 'Locate the selection: white beam at centre'}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={highlight.isActive ? 'default' : 'outline'}
            size="sm"
            onPointerDown={highlight.press}
            onPointerUp={highlight.release}
            onPointerCancel={highlight.release}
            onPointerLeave={highlight.release}
          >
            <Flashlight className="size-3.5" />
            Highlight
          </Button>
        </TooltipTrigger>
        <TooltipContent>Hold: full intensity on the selection, restored on release</TooltipContent>
      </Tooltip>
      <Button variant="ghost" size="sm" onClick={onClear}>
        <X className="size-3.5" />
        Clear
      </Button>
    </div>
  )
}
