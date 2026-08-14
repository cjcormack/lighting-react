import { useCallback, useState } from 'react'
import { useParams } from 'react-router'
import { Crosshair, Flashlight, SwatchBook, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useLocateStateQuery, useToggleLocateMutation } from '../../store/locate'
import { ApplyPalettePopover } from '../palettes/ApplyPalettePopover'
import { RecordPaletteSheet } from '../palettes/RecordPaletteSheet'
import { getStoredPaletteType } from '../ViewSwitcher'
import { FanPopover } from './FanPopover'
import { useHighlight } from './useHighlight'
import type { LocateTarget } from '../../store/locate'
import type { WriteTarget } from './rowModel'

export interface SelectionToolbarProps {
  /** Selected rows as locate targets (groups stay groups — the backend
   *  handles their members natively). */
  locateTargets: readonly LocateTarget[]
  /** Distinct write targets (fixtures or elements) the selection expands to,
   *  in visible row order. */
  targets: readonly WriteTarget[]
  onClear: () => void
}

export function SelectionToolbar({ locateTargets, targets, onClear }: SelectionToolbarProps) {
  const { data: locateState } = useLocateStateQuery()
  const [toggleLocate] = useToggleLocateMutation()
  const { projectId } = useParams()
  const [recordPaletteOpen, setRecordPaletteOpen] = useState(false)
  const getTargets = useCallback(() => [...targets], [targets])
  const highlight = useHighlight(getTargets)

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
    <div className="flex items-center gap-1.5 sm:gap-2">
      {/* "12 selected" is three times the width of "12" and says the same thing next to a
          row of selection actions. Narrow viewports get the number alone. */}
      <span className="text-xs text-muted-foreground tabular-nums">
        {targets.length}
        <span className="hidden sm:inline"> selected</span>
      </span>
      <FanPopover targets={targets} />
      {/* Palette actions live here rather than in ProgrammerToolbar: both are definitionally
          selection-scoped, and a toolbar-wide "Apply palette" would sit permanently disabled
          whenever nothing is selected. */}
      <ApplyPalettePopover targets={targets} />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" onClick={() => setRecordPaletteOpen(true)}>
            <SwatchBook className="size-3.5" />
            <span className="hidden sm:inline">Record palette</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Save the selection’s programmer values as a named palette
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={allLocated ? 'default' : 'outline'}
            size="sm"
            onClick={locateSelection}
            className={allLocated ? 'bg-sky-500 text-white hover:bg-sky-600' : ''}
          >
            <Crosshair className="size-3.5" />
            <span className="hidden sm:inline">Locate</span>
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
            <span className="hidden sm:inline">Highlight</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Hold: full intensity on the selection, restored on release</TooltipContent>
      </Tooltip>
      {/* "Deselect", not "Clear": on the programmer sheet this sits beside the programmer's
          own Clear, and two buttons a few pixels apart that mean "drop the selection" and
          "release every value on the rig" must not share a label. */}
      <Button variant="ghost" size="sm" onClick={onClear} title="Deselect all">
        <X className="size-3.5" />
        <span className="hidden sm:inline">Deselect</span>
      </Button>

      <RecordPaletteSheet
        open={recordPaletteOpen}
        onOpenChange={setRecordPaletteOpen}
        projectId={Number(projectId)}
        // The type the operator last worked in, so recording a second colour palette straight
        // after a first doesn't ask the same question twice.
        defaultType={getStoredPaletteType()}
        targets={targets.map((target) => ({ type: 'fixture' as const, key: target.key }))}
      />
    </div>
  )
}
