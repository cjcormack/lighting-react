import { Label } from '@/components/ui/label'
import type { ProgrammerSkip, PropertyMaskGroup } from '@/store/programmerOps'

/**
 * The four attribute families Record / Include / Update can be scoped to.
 *
 * Deliberately coarser than the backend's 22 `PropertyCategory` values: the same physical
 * attribute is annotated differently across heads (a gobo wheel is a setting on one fixture
 * and a plain slider on another), so a category-level mask would silently miss fixtures. This
 * is the console I/P/C/B vocabulary, and it is four checkboxes rather than twenty-two.
 */
const MASK_GROUPS: { value: PropertyMaskGroup; label: string }[] = [
  { value: 'INTENSITY', label: 'Intensity' },
  { value: 'POSITION', label: 'Position' },
  { value: 'COLOUR', label: 'Colour' },
  { value: 'BEAM', label: 'Beam' },
]

export interface MaskPickerProps {
  value: PropertyMaskGroup[]
  onChange: (next: PropertyMaskGroup[]) => void
}

/** An empty selection means "everything" — the same thing the server does with an empty mask. */
export function MaskPicker({ value, onChange }: MaskPickerProps) {
  const toggle = (group: PropertyMaskGroup) => {
    onChange(value.includes(group) ? value.filter((g) => g !== group) : [...value, group])
  }

  return (
    <div className="space-y-2">
      <Label>Attributes</Label>
      <div className="flex flex-wrap gap-3">
        {MASK_GROUPS.map((group) => (
          <label key={group.value} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={value.includes(group.value)}
              onChange={() => toggle(group.value)}
              className="size-4"
            />
            {group.label}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {value.length === 0 ? 'All attributes.' : `Only ${value.length} of 4 attribute groups.`}
      </p>
    </div>
  )
}

const SKIP_REASONS: Record<ProgrammerSkip['reason'], string> = {
  ELEMENT_TARGET: 'element-level entries (cues address whole fixtures)',
  MISSING_FIXTURE: 'fixtures no longer in the patch',
  MISSING_PROPERTY: 'properties that no longer resolve',
  NO_BACKING_PROPERTY: 'raw channels with no backing property',
  MASKED_OUT: 'entries outside the attribute mask',
}

/**
 * One line summarising what a write skipped, or null when nothing was.
 *
 * Silent truncation reads as "recorded everything", which is the failure mode this whole
 * session exists to remove — so the counts are surfaced even when they are boring.
 */
export function describeSkips(skips: readonly ProgrammerSkip[]): string | null {
  if (skips.length === 0) return null
  const byReason = new Map<ProgrammerSkip['reason'], number>()
  for (const skip of skips) byReason.set(skip.reason, (byReason.get(skip.reason) ?? 0) + 1)
  const parts = [...byReason.entries()].map(([reason, count]) => `${count} ${SKIP_REASONS[reason]}`)
  return `Skipped: ${parts.join('; ')}.`
}
