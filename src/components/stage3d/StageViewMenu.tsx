import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { StageViewFlags } from './useStageView'

interface StageViewMenuProps {
  flags: StageViewFlags
  setFlag: <K extends keyof StageViewFlags>(key: K, value: boolean) => void
}

export function StageViewMenu({ flags, setFlag }: StageViewMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" aria-label="View options">
          <Eye className="size-3.5 mr-1" />
          View
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Show</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={flags.fixtures}
          onCheckedChange={(v) => setFlag('fixtures', !!v)}
        >
          Fixtures
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={flags.beamCones}
          onCheckedChange={(v) => setFlag('beamCones', !!v)}
        >
          Beam cones
        </DropdownMenuCheckboxItem>
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
