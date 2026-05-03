import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FieldGroup, NumberField } from '@/components/ui/form-fields'
import { useRiggingListQuery } from '@/store/riggings'
import { bySortOrder } from '@/lib/utils'

const FREE = 'free'

export interface PatchPlacementValue {
  riggingUuid: string | null
  stageX: number | null
  stageY: number | null
  stageZ: number | null
  baseYawDeg: number | null
  basePitchDeg: number | null
}

interface Props {
  projectId: number
  value: PatchPlacementValue
  onChange: (next: PatchPlacementValue) => void
}

export function PatchPlacementFields({ projectId, value, onChange }: Props) {
  const { data: riggings } = useRiggingListQuery(projectId)
  const sortedRiggings = (riggings ?? []).slice().sort(bySortOrder)

  const mountValue = value.riggingUuid ?? FREE
  const isMounted = value.riggingUuid != null

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="patch-mount">Mounting</Label>
        <Select
          value={mountValue}
          onValueChange={(v) =>
            onChange({ ...value, riggingUuid: v === FREE ? null : v })
          }
        >
          <SelectTrigger id="patch-mount" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FREE}>Free</SelectItem>
            {sortedRiggings.map((r) => (
              <SelectItem key={r.uuid} value={r.uuid}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <FieldGroup label="Position (m)">
          <NumberField
            id="patch-stage-x"
            label="X"
            value={value.stageX}
            onChange={(v) => onChange({ ...value, stageX: v })}
          />
          <NumberField
            id="patch-stage-y"
            label="Y"
            value={value.stageY}
            onChange={(v) => onChange({ ...value, stageY: v })}
          />
          <NumberField
            id="patch-stage-z"
            label="Z"
            value={value.stageZ}
            onChange={(v) => onChange({ ...value, stageZ: v })}
          />
        </FieldGroup>
        <p className="text-xs text-muted-foreground">
          {isMounted
            ? 'Offset from rigging origin (X = along truss, Y = out from truss, Z = drop).'
            : 'World coordinates (X = stage right, Y = upstage, Z = height).'}
        </p>
      </div>

      <details className="group">
        <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground select-none">
          Base orientation (advanced)
        </summary>
        <div className="pt-3">
          <FieldGroup label="Base orientation (°)">
            <NumberField
              id="patch-base-yaw"
              label="Yaw"
              value={value.baseYawDeg}
              onChange={(v) => onChange({ ...value, baseYawDeg: v })}
            />
            <NumberField
              id="patch-base-pitch"
              label="Pitch"
              value={value.basePitchDeg}
              onChange={(v) => onChange({ ...value, basePitchDeg: v })}
            />
          </FieldGroup>
        </div>
      </details>
    </div>
  )
}
