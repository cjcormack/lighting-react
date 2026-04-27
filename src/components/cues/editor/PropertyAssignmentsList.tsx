import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { describeHealth } from '@/lib/healthDescriptor'
import {
  useTargetProperties,
  defaultValueFor,
  placeholderFor,
  type AvailableProperty,
} from './targetProperties'
import type { CuePropertyAssignment } from '@/api/cuesApi'
import type { TargetSelection } from './CueTargetGrid'

interface PropertyAssignmentsListProps {
  selection: TargetSelection
  assignments: { assignment: CuePropertyAssignment; index: number }[]
  onAdd: (assignment: CuePropertyAssignment) => void
  onUpdate: (index: number, assignment: CuePropertyAssignment) => void
  onRemove: (index: number) => void
}

/**
 * Row-list editor for the cue's Layer 3 `propertyAssignments`, filtered to the selected
 * target. Sibling to the implicit author-via-grid flow — both edit the same array on
 * the parent `CueEditor`. Shows per-row value, fade-duration override, and (for `position`
 * rows only) the `moveInDark` toggle which makes the resolver pre-apply the new pan/tilt
 * during an outgoing fade-out when the outgoing cue ends dark.
 */
export function PropertyAssignmentsList({
  selection,
  assignments,
  onAdd,
  onUpdate,
  onRemove,
}: PropertyAssignmentsListProps) {
  const [adding, setAdding] = useState(false)
  const available = useTargetProperties(selection)
  const addableProperties = useMemo(
    () => available.filter((p) => assignments.every((a) => a.assignment.propertyName !== p.name)),
    [available, assignments],
  )

  return (
    <>
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setAdding(true)}
          disabled={adding || addableProperties.length === 0}
        >
          <Plus className="size-3" /> Add Assignment
        </Button>
      </div>

      {adding && (
        <AddAssignmentForm
          targetType={selection.type}
          targetKey={selection.key}
          properties={addableProperties}
          onConfirm={(next) => {
            onAdd(next)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {!adding && assignments.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No property assignments for this {selection.type}.
        </p>
      )}

      {assignments.map(({ assignment, index }) => (
        <AssignmentRow
          key={`assignment-${index}`}
          assignment={assignment}
          onUpdate={(next) => onUpdate(index, next)}
          onRemove={() => onRemove(index)}
        />
      ))}
    </>
  )
}

function AssignmentRow({
  assignment,
  onUpdate,
  onRemove,
}: {
  assignment: CuePropertyAssignment
  onUpdate: (assignment: CuePropertyAssignment) => void
  onRemove: () => void
}) {
  const isPosition = assignment.propertyName === 'position'
  const healthLabel = describeHealth(assignment.health)

  return (
    <div className="flex flex-col gap-2 rounded border bg-muted/20 p-2">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[10px] font-mono">
          {assignment.propertyName}
        </Badge>
        {healthLabel && (
          <Badge variant="destructive" className="text-[10px]">
            {healthLabel}
          </Badge>
        )}
        <div className="grow" />
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-destructive shrink-0"
          onClick={onRemove}
          aria-label="Remove assignment"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground">Value</Label>
          <Input
            value={assignment.value}
            onChange={(e) => onUpdate({ ...assignment, value: e.target.value })}
            className="h-7 text-xs font-mono"
            placeholder={isPosition ? 'pan,tilt' : '0..255'}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground">Fade ms</Label>
          <Input
            value={assignment.fadeDurationMs ?? ''}
            onChange={(e) => {
              const raw = e.target.value.trim()
              const next = raw === '' ? null : Number(raw)
              onUpdate({
                ...assignment,
                fadeDurationMs: Number.isFinite(next as number) ? (next as number) : null,
              })
            }}
            className="h-7 text-xs w-24"
            placeholder="(cue)"
            inputMode="numeric"
          />
        </div>
      </div>

      {isPosition && (
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={assignment.moveInDark ?? false}
            onChange={(e) => onUpdate({ ...assignment, moveInDark: e.target.checked })}
            className="rounded border-input"
          />
          <span className="font-medium">Move in dark</span>
          <span className="text-muted-foreground">
            Pre-apply pan/tilt when the outgoing cue ends dark
          </span>
        </label>
      )}
    </div>
  )
}

function AddAssignmentForm({
  targetType,
  targetKey,
  properties,
  onConfirm,
  onCancel,
}: {
  targetType: 'fixture' | 'group'
  targetKey: string
  properties: AvailableProperty[]
  onConfirm: (assignment: CuePropertyAssignment) => void
  onCancel: () => void
}) {
  const [propertyName, setPropertyName] = useState(properties[0]?.name ?? '')
  const selected = properties.find((p) => p.name === propertyName)
  const [value, setValue] = useState(() => defaultValueFor(properties[0]))

  const onPropertyChange = (next: string) => {
    setPropertyName(next)
    setValue(defaultValueFor(properties.find((p) => p.name === next)))
  }

  const canConfirm = propertyName.length > 0 && value.trim().length > 0

  return (
    <div className="flex flex-col gap-2 rounded border bg-muted/30 p-2">
      <div className="grid grid-cols-[1fr_1fr] gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground">Property</Label>
          <select
            value={propertyName}
            onChange={(e) => onPropertyChange(e.target.value)}
            className="h-7 rounded border border-input bg-background px-2 text-xs"
          >
            {properties.map((p) => (
              <option key={p.name} value={p.name}>
                {p.displayName} ({p.name})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground">
            Value {selected ? `(${selected.type})` : ''}
          </Label>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-7 text-xs font-mono"
            placeholder={selected ? placeholderFor(selected) : ''}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() =>
            onConfirm({
              targetType,
              targetKey,
              propertyName,
              value: value.trim(),
            })
          }
          disabled={!canConfirm}
        >
          Add
        </Button>
      </div>
    </div>
  )
}

