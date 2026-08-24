import { useCallback, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { formatError } from '@/lib/formatError'
import { DEFERRED_TARGET_TYPE, type TemplateSummary } from '@/api/templatesApi'
import { useCreateTemplateMutation, useTemplateListQuery } from '@/store/templates'
import {
  serializeTemplateIntent,
  templateIntentSwatch,
  describeTemplateIntent,
} from '@/lib/templateIntent'
import { parseTemplateRefUuid, serializeTemplateRef } from './colourUtils'

/**
 * The colour templates an FX colour parameter may reference, and the row of chips that offers them.
 *
 * This is what replaced the positional palette row in both colour pickers. The difference that
 * matters to an operator is that a reference **has a name and follows its template**: retune "Warm
 * Key" and every running effect that names it moves, which is what the `P1` slots were reaching for
 * without an identity to hang it on.
 *
 * **Only generic colour templates are offered**, and that is a property of the mechanism rather than
 * a simplification: an effect's colour output is one colour applied to every head it targets, so
 * there is nothing for a fixture-agnostic output to take from a per-fixture template (eight heads
 * aimed at one spot hold eight different colours). `templateColourSource` on the backend refuses one
 * for the same reason.
 *
 * **A swatch here can lag a retune in *another* tab, and that is the documented tradeoff rather than
 * a bug.** `templatesWsApi` deliberately does not broadcast a contents change — only CRUD — so a
 * colour drag is not an invalidation storm behind an open editor. `saveTemplate` invalidates
 * `TemplateList`, so the tab doing the retune is current; the rig is current either way, since it
 * follows `TemplateRegistry.version` rather than anything on this side.
 */

/** A template this picker can offer: exactly one family, exactly one generic row, and that a colour. */
function isOfferable(template: TemplateSummary): boolean {
  return template.family === 'COLOUR' && template.isGeneric && template.rows.length === 1
}

export interface ColourTemplates {
  /** The offerable templates, in library order. Empty while loading, or outside a project. */
  templates: TemplateSummary[]
  /** The template a `tmpl:` value names, or null for a literal *or* a reference that no longer resolves. */
  templateFor: (value: string) => TemplateSummary | null
  /**
   * What to draw a `tmpl:` value as: its name, a wait marker while the library is still arriving, or
   * a plain marker once it has arrived without it. The three are distinct because "broken" and "not
   * loaded yet" look identical from here and only one of them is worth acting on.
   */
  labelFor: (value: string) => string
  /** The hex to draw a `tmpl:` value as, or null when it cannot be resolved. */
  swatchFor: (value: string) => string | null
}

/**
 * The offerable templates plus the three lookups a picker needs to render a reference.
 *
 * `projectId` comes from the route rather than a prop: the pickers are mounted from three different
 * sheets, none of which threads a project down, and the FX *library* page has no project at all —
 * which is what the `skip` is for. A picker there simply offers no templates and still edits
 * literals, so the form degrades rather than breaking.
 */
export function useColourTemplates(): ColourTemplates {
  const { projectId } = useParams<{ projectId: string }>()
  const projectIdNum = projectId ? Number(projectId) : NaN
  const { data, isLoading } = useTemplateListQuery(
    { projectId: projectIdNum, family: 'COLOUR' },
    { skip: !Number.isFinite(projectIdNum) },
  )

  const templates = useMemo(() => (data ?? []).filter(isOfferable), [data])
  const byUuid = useMemo(
    () => new Map(templates.map((t) => [t.uuid, t] as const)),
    [templates],
  )

  const templateFor = useCallback(
    (value: string) => {
      const uuid = parseTemplateRefUuid(value)
      return uuid ? byUuid.get(uuid) ?? null : null
    },
    [byUuid],
  )

  const labelFor = useCallback(
    // A first paint happens before the library query resolves, so an unmatched uuid is not evidence
    // of a dangling reference yet. Saying "Missing template" there reported every perfectly good
    // reference as broken for the width of one round-trip.
    (value: string) => templateFor(value)?.name ?? (isLoading ? 'Loading…' : 'Missing template'),
    [templateFor, isLoading],
  )

  const swatchFor = useCallback(
    (value: string) => {
      const template = templateFor(value)
      return template ? templateIntentSwatch(template.rows[0].value) : null
    },
    [templateFor],
  )

  return { templates, templateFor, labelFor, swatchFor }
}

/**
 * The Templates row inside a colour picker's popover: pick one, or mint one from the colour you have
 * just dialled in.
 *
 * The save affordance mirrors `TemplateStrip`'s new-from-selection chip, and for the same reason —
 * it is how the library fills up without anyone visiting `/templates`. It writes `policy=extract`,
 * the default a wash wants, which the template editor can retune afterwards.
 */
export function FxColourTemplateRow({
  templates,
  /** The colour currently in the picker, offered as the body of a new template. */
  currentHex,
  onPick,
  /** Highlighted chip, when the parameter already references a template. */
  selectedUuid,
}: {
  templates: TemplateSummary[]
  currentHex: string
  onPick: (value: string) => void
  selectedUuid?: string | null
}) {
  const { projectId } = useParams<{ projectId: string }>()
  const projectIdNum = projectId ? Number(projectId) : NaN
  const [createTemplate, { isLoading: isCreating }] = useCreateTemplateMutation()
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const canCreate = Number.isFinite(projectIdNum)

  const handleCreate = useCallback(async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      const created = await createTemplate({
        projectId: projectIdNum,
        name: trimmed,
        rows: [
          {
            targetType: DEFERRED_TARGET_TYPE,
            targetKey: '',
            propertyName: 'rgbColour',
            value: serializeTemplateIntent({ kind: 'colour', hex: currentHex, policy: 'extract' }),
          },
        ],
      }).unwrap()
      onPick(serializeTemplateRef(created.uuid))
      setNaming(false)
      setName('')
    } catch (err) {
      toast.error(formatError(err))
    }
  }, [createTemplate, currentHex, name, onPick, projectIdNum])

  if (!canCreate && templates.length === 0) return null

  return (
    <div className="space-y-1.5 pt-2 border-t border-border">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Templates</p>
      {templates.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {templates.map((template) => {
            const hex = templateIntentSwatch(template.rows[0].value)
            return (
              <button
                key={template.uuid}
                type="button"
                title={`${template.name} — ${describeTemplateIntent(template.rows[0].value)}`}
                onClick={() => onPick(serializeTemplateRef(template.uuid))}
                className={
                  'flex items-center gap-1 h-6 pl-1 pr-1.5 rounded border text-[11px] hover:bg-accent/50 transition-colors ' +
                  (template.uuid === selectedUuid ? 'border-primary' : 'border-border')
                }
              >
                <span
                  className="size-3.5 rounded-sm border border-border shrink-0"
                  style={{ backgroundColor: hex ?? 'transparent' }}
                />
                <span className="max-w-[9rem] truncate">{template.name}</span>
              </button>
            )
          })}
        </div>
      )}
      {canCreate && (naming ? (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name"
            className="h-7 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleCreate()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setNaming(false)
              }
            }}
          />
          <Button size="sm" className="h-7" disabled={!name.trim() || isCreating} onClick={handleCreate}>
            Save
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-1 text-[11px] text-muted-foreground"
          onClick={() => setNaming(true)}
        >
          <Plus className="size-3" />
          Save {currentHex} as template…
        </Button>
      ))}
    </div>
  )
}
