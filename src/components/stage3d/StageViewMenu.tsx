import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  VIS_SOURCES,
  VIS_SOURCE_HINTS,
  VIS_SOURCE_LABELS,
  isVisSource,
  type VisSource,
} from '@/hooks/useVisSource'
import type { StageViewFlags } from './useStageView'

interface StageViewMenuProps {
  flags: StageViewFlags
  setFlag: <K extends keyof StageViewFlags>(key: K, value: boolean) => void
  /** Flags with no meaning in the current view — e.g. beam cones in a 2D plot. */
  hide?: ReadonlyArray<keyof StageViewFlags>
  /** Which layer of the lighting cascade the stage draws. */
  visSource: VisSource
  setVisSource: (next: VisSource) => void
}

export function StageViewMenu({
  flags,
  setFlag,
  hide,
  visSource,
  setVisSource,
}: StageViewMenuProps) {
  const hidden = (key: keyof StageViewFlags) => hide?.includes(key) ?? false
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" aria-label="View options">
          <Eye className="size-3.5 mr-1" />
          View
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Source</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={visSource}
          onValueChange={(v) => {
            if (isVisSource(v)) setVisSource(v)
          }}
        >
          {VIS_SOURCES.map((source) => (
            <DropdownMenuRadioItem key={source} value={source} className="items-start">
              <span className="flex flex-col gap-0.5">
                <span>{VIS_SOURCE_LABELS[source]}</span>
                {/* Not decoration: "Output + Programmer" is identical to "Output" whenever
                    Blind is off, so without the hint that option reads as broken. */}
                <span className="text-xs text-muted-foreground">{VIS_SOURCE_HINTS[source]}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Show</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={flags.fixtures}
          onCheckedChange={(v) => setFlag('fixtures', !!v)}
        >
          Fixtures
        </DropdownMenuCheckboxItem>
        {!hidden('beamCones') && (
          <DropdownMenuCheckboxItem
            checked={flags.beamCones}
            onCheckedChange={(v) => setFlag('beamCones', !!v)}
          >
            Beam cones
          </DropdownMenuCheckboxItem>
        )}
        <DropdownMenuCheckboxItem
          checked={flags.riggings}
          onCheckedChange={(v) => setFlag('riggings', !!v)}
        >
          Rigging
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={flags.regions}
          onCheckedChange={(v) => setFlag('regions', !!v)}
        >
          Regions
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={flags.labels}
          onCheckedChange={(v) => setFlag('labels', !!v)}
        >
          Labels
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
