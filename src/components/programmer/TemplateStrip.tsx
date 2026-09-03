import { useCallback, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AudioWaveform, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { COLUMN_CATEGORY, type ColumnKey } from '@/components/fixtures-list/columns'
import type { CellRef } from '@/components/fixtures-list/cellSelectionModel'
import { familyForCategory, FAMILY_LABELS, type AttributeFamily } from '@/lib/attributeFamily'
import { templateIntentSwatch, describeTemplateIntent } from '@/lib/templateIntent'
import {
  useApplyTemplateMutation,
  useTemplateGroupListQuery,
  useTemplateListQuery,
  useToggleTemplateMutation,
} from '@/store/templates'
import { buildTemplateLayout } from '@/lib/templateLayout'
import { selectTargetKeys } from '@/store/selectionSlice'
import { formatError } from '@/lib/formatError'
import { NewTemplateFromSelectionSheet } from './NewTemplateFromSelectionSheet'
import type { TemplateSummary, TemplateTarget } from '@/api/templatesApi'

/**
 * The template strip: the templates that fit what you have selected, one press away.
 *
 * **The selection is the filter**, which is the whole design: select colour cells and only colour
 * templates are offered, so there is no picker to open and no family dropdown to get wrong. It reads
 * the *cell* selection where there is one (the marquee says which attribute you mean) and falls back
 * to the fixture selection's whole vocabulary where there is not.
 *
 * **Two gestures, because there are two things you might mean**, and they are the reason a template
 * is not just a value you paste:
 *
 *  - **click** sets literal values in Local. Retuning the template later does not move them. This is
 *    the busking gesture, and it is why the retired `ref:` grammar is not missed here.
 *  - **⌥click** adds a layer that *tracks* it, targeted at the selection and masked to the
 *    template's family. Retune the template and every layer moves.
 *
 * The last chip records the selection as a new template, which is how the library fills up without
 * anyone visiting it.
 */
export function TemplateStrip({
  projectId,
  cells,
}: {
  projectId: number
  /** The marquee's cells. Empty when the operator has selected rows but not cells. */
  cells: readonly CellRef[]
}) {
  const { data: templates } = useTemplateListQuery({ projectId }, { skip: !projectId })
  const { data: templateGroups } = useTemplateGroupListQuery({ projectId }, { skip: !projectId })
  const [applyTemplate] = useApplyTemplateMutation()
  const [toggleTemplate] = useToggleTemplateMutation()
  const [newOpen, setNewOpen] = useState(false)

  const selectedKeys = useSelector((s: Parameters<typeof selectTargetKeys>[0]) =>
    selectTargetKeys(s, 'programmer'),
  )

  /**
   * The families the selection is asking about.
   *
   * From the **cells** when there are any — a marquee across the Colour column means colour, and
   * nothing else. With rows selected but no cells there is no attribute in the gesture, so every
   * family is offered rather than guessing one.
   */
  const families = useMemo<AttributeFamily[] | null>(() => {
    if (cells.length === 0) return null
    const out = new Set<AttributeFamily>()
    for (const cell of cells) out.add(familyForCategory(COLUMN_CATEGORY[cell.col as ColumnKey]))
    return [...out]
  }, [cells])

  const targets = useMemo<TemplateTarget[]>(
    () => selectedKeys.map((key) => ({ type: 'fixture' as const, key })),
    [selectedKeys],
  )

  const visible = useMemo(() => {
    // The library's own order — the same walk the busk view and `/templates` take, so a chip sits
    // where the operator put it. A group is flattened: the strip is a row of chips with no room
    // for a cluster, and exclusivity is the toggle route's to apply, not the strip's to draw.
    const all = buildTemplateLayout(templates ?? [], templateGroups ?? []).flatMap((entry) =>
      entry.kind === 'template' ? [entry.template] : entry.templates,
    )
    if (families == null) return all
    return all.filter((t) => t.family != null && families.includes(t.family))
  }, [templates, templateGroups, families])

  /**
   * Values, then a hairline, then effects (fx-templates D10) — the busk column's split, sideways.
   *
   * Library order holds inside each half; nothing is sorted here and nothing was before. The
   * hairline is drawn only when both halves have something in them, so a colour selection with no
   * colour effect templates looks exactly as it did.
   */
  const valueChips = useMemo(() => visible.filter((t) => t.kind !== 'effect'), [visible])
  const effectChips = useMemo(() => visible.filter((t) => t.kind === 'effect'), [visible])

  const press = useCallback(
    (template: TemplateSummary, additive: boolean) => {
      if (targets.length === 0) {
        toast.error('Select the fixtures this should land on first')
        return
      }
      const request = additive
        ? toggleTemplate({
            projectId,
            templateId: template.id,
            targets,
            propertyMask: template.family ?? undefined,
          })
        : applyTemplate({ projectId, templateId: template.id, targets })
      request
        .unwrap()
        .then((result) => {
          // The skips are the honest half of a type-agnostic apply: a head with no dimmer takes no
          // level, and saying nothing would look like the press did nothing.
          if ('skipped' in result && result.skipped.length > 0) {
            toast.warning(
              `${result.written} head${result.written === 1 ? '' : 's'} set · ${result.skipped.length} could not take it`,
            )
            return
          }
          // An **effect** template writes no literals at all — it mints detached programmer-band
          // copies, so `written` stays 0 and `effectIds` is the whole result. Without this the one
          // gesture that reaches the rig hardest is the only one that says nothing.
          //
          // An *empty* list is reported too, and that is the half worth keeping: a press that
          // started nothing looks exactly like a press that started everything, and the value arm
          // above has `skipped` to say so where this one has only the count.
          if ('effectIds' in result && result.effectIds != null) {
            const count = result.effectIds.length
            if (count === 0) {
              toast.warning('Nothing started — no selected head could take this effect')
            } else {
              toast.success(`${count} effect${count === 1 ? '' : 's'} started`)
            }
          }
        })
        .catch((err) => toast.error(formatError(err)))
    },
    [applyTemplate, toggleTemplate, projectId, targets],
  )

  if ((templates?.length ?? 0) === 0 && targets.length === 0) return null

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {families != null && (
          <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
            {families.map((f) => FAMILY_LABELS[f].singular).join(' · ')}
          </Badge>
        )}

        {valueChips.map((template) => (
          <TemplateChip key={template.id} template={template} onPress={press} />
        ))}

        {valueChips.length > 0 && effectChips.length > 0 && (
          <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />
        )}

        {effectChips.map((template) => (
          <TemplateChip key={template.id} template={template} onPress={press} />
        ))}

        {/* The chip that fills the library. Disabled without a selection for the same reason the
            presses are: there is nothing to record. */}
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 border-dashed px-2 text-xs"
          disabled={targets.length === 0}
          title={
            targets.length === 0
              ? 'Select the fixtures whose values you want to keep'
              : 'Record what you have selected as a new template'
          }
          onClick={() => setNewOpen(true)}
        >
          <Plus className="size-3.5" />
          New from selection
        </Button>
      </div>

      <NewTemplateFromSelectionSheet
        open={newOpen}
        onOpenChange={setNewOpen}
        projectId={projectId}
        families={families}
      />
    </>
  )
}

function TemplateChip({
  template,
  onPress,
}: {
  template: TemplateSummary
  onPress: (template: TemplateSummary, additive: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={(e) => onPress(template, e.altKey)}
      title={
        // The two gestures, stated on the chip rather than left to be discovered: ⌥click is not a
        // thing an operator guesses, and it is the one that creates a dependency. For an effect the
        // click half says **a copy**, which is the whole difference between the two: the instance a
        // click mints carries no `LayerSource`, so retuning the template afterwards never moves it.
        template.kind === 'effect'
          ? `Click to run a copy of “${template.name}” on the selection · ⌥click to add a layer that tracks it`
          : `Click to set these values · ⌥click to add a layer that tracks “${template.name}”`
      }
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
        'hover:bg-accent/60 active:scale-95',
      )}
    >
      {/* An effect template holds no rows, so there is no value to preview — the glyph the whole
          desk uses for FX says what the press will do instead of a blank gap. */}
      {template.kind === 'effect' ? (
        <AudioWaveform className="size-3 shrink-0 text-muted-foreground" />
      ) : templateIntentSwatch(template.rows[0]?.value ?? '') != null ? (
        <span
          className="size-3 rounded-sm border border-border/60"
          style={{ background: templateIntentSwatch(template.rows[0].value) ?? undefined }}
        />
      ) : (
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {template.rows[0] != null ? describeTemplateIntent(template.rows[0].value) : ''}
        </span>
      )}
      <span className="truncate max-w-32">{template.name}</span>
    </button>
  )
}
