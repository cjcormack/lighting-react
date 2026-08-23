import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HexColorPicker } from 'react-colorful'
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  useUnsavedChanges,
} from '@/components/ui/sheet'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Loader2, Trash2 } from 'lucide-react'
import { ATTRIBUTE_FAMILIES, FAMILY_LABELS, type AttributeFamily } from '@/lib/attributeFamily'
import {
  TEMPLATE_EXCLUSIONS,
  WHITE_POLICIES,
  WHITE_POLICY_LABELS,
  describeTemplateIntent,
  parseTemplateIntent,
  serializeTemplateIntent,
  templatePropertiesForFamily,
  type TemplateIntent,
  type WhitePolicy,
} from '@/lib/templateIntent'
import { DEFERRED_TARGET_TYPE, type TemplateInput, type TemplateRow, type TemplateSummary } from '@/api/templatesApi'
import { formatError } from '@/lib/formatError'
import { TemplateResolvesTo } from './TemplateResolvesTo'

/**
 * Authoring a template: **family first, then one family-native control.**
 *
 * The whole difference from the editor this replaces. `LookEditor` asked for an `editorFixtureType`
 * before anything else, built a synthetic fixture from it, and rendered a descriptor-driven property
 * grid — which is what made "Amber Key" a MAC Aura's colour rather than a colour. There is no fixture
 * type here and no grid: the family is the template's identity, the control is native to it (a colour
 * picker, one level, a pan/tilt pad in degrees), and what gets stored is an **intent** resolved per
 * head at cook.
 *
 * Two things this editor deliberately does not do:
 *
 *  - **It does not create a per-fixture template.** Eight heads aimed at one spot is a *recording* —
 *    the values come from where the heads actually are — so it comes from the programmer's strip.
 *    Opening one here edits its name, notes and fade, and lists its values read-only, which is the
 *    same stance `LookDetailSheet` takes and for the same reason: there is no authoring gesture that
 *    would improve on re-recording from the rig.
 *  - **It does not offer a slotted role.** Gobo and the wheel/macro channels are shown disabled with
 *    the reason, rather than omitted — an operator looking for gobo needs to learn *where* it lives.
 */
export function TemplateEditor({
  open,
  onOpenChange,
  projectId,
  template,
  onSave,
  isSaving,
  onDelete,
  isDeleting,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  /** Null for a create draft. */
  template: TemplateSummary | null
  onSave: (input: TemplateInput) => Promise<void>
  isSaving: boolean
  onDelete?: () => void
  isDeleting?: boolean
}) {
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [fadeSeconds, setFadeSeconds] = useState('')
  const [family, setFamily] = useState<AttributeFamily>('COLOUR')
  /**
   * The draft value per property, keyed by property name.
   *
   * A map rather than one value, because a family can hold more than one property: intensity is a
   * level *and* a strobe, and beam is four continuous roles plus prism. Only the entries present are
   * written, so an untouched property is absent from the template rather than stored at zero.
   */
  const [values, setValues] = useState<Record<string, TemplateIntent>>({})
  const [saveError, setSaveError] = useState<unknown>(null)

  /**
   * Which template this session has been seeded from — `null` for a create draft, `undefined` while
   * closed.
   *
   * Keyed by id rather than by the object: the query hands back a fresh object whenever the
   * `Template` tag is invalidated, and re-seeding on that would silently replace whatever the
   * operator was halfway through typing while `isDirty` read false. Same trap `LookEditor` documented.
   */
  const seededRef = useRef<number | null | undefined>(undefined)

  useEffect(() => {
    if (!open) {
      seededRef.current = undefined
      return
    }
    const key = template?.id ?? null
    if (seededRef.current === key) return
    seededRef.current = key
    setSaveError(null)
    setName(template?.name ?? '')
    setNotes(template?.notes ?? '')
    setFadeSeconds(template?.fadeDurationMs != null ? String(template.fadeDurationMs / 1000) : '')
    setFamily(template?.family ?? 'COLOUR')
    setValues(seedValues(template))
  }, [open, template])

  const isGeneric = template == null || template.isGeneric
  const properties = templatePropertiesForFamily(family)

  /** The rows this draft would save — also what the resolves-to panel asks about. */
  const rows = useMemo<TemplateRow[]>(() => {
    if (!isGeneric) return template?.rows ?? []
    return properties
      .filter((p) => values[p.propertyName] != null)
      .map((p, index) => ({
        targetType: DEFERRED_TARGET_TYPE,
        targetKey: '',
        propertyName: p.propertyName,
        value: serializeTemplateIntent(values[p.propertyName]),
        sortOrder: index,
      }))
  }, [isGeneric, properties, values, template])

  const fadeMs = useMemo(() => {
    const seconds = Number(fadeSeconds)
    if (fadeSeconds.trim() === '' || !Number.isFinite(seconds) || seconds < 0) return null
    return Math.round(seconds * 1000)
  }, [fadeSeconds])

  const isDirty = useMemo(() => {
    if (template == null) return name.trim().length > 0 || rows.length > 0
    if (name !== template.name) return true
    if ((notes || null) !== (template.notes ?? null)) return true
    if (fadeMs !== template.fadeDurationMs) return true
    return JSON.stringify(rows.map(rowKey)) !== JSON.stringify((template.rows ?? []).map(rowKey))
  }, [template, name, notes, fadeMs, rows])

  useUnsavedChanges(isDirty)

  const isValid = name.trim().length > 0 && rows.length > 0

  const setIntent = useCallback((propertyName: string, intent: TemplateIntent | null) => {
    setValues((prev) => {
      if (intent == null) {
        if (prev[propertyName] == null) return prev
        const next = { ...prev }
        delete next[propertyName]
        return next
      }
      return { ...prev, [propertyName]: intent }
    })
  }, [])

  const handleSave = async () => {
    setSaveError(null)
    try {
      await onSave({
        name: name.trim(),
        notes: notes.trim() === '' ? null : notes.trim(),
        notesPresent: true,
        fadeDurationMs: fadeMs,
        fadeDurationMsPresent: true,
        // A per-fixture template's rows are not editable here, so they are omitted rather than
        // echoed — sending them back would make a metadata edit a full rewrite of the values.
        ...(isGeneric ? { rows } : {}),
      })
      onOpenChange(false)
    } catch (err) {
      setSaveError(err)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{template == null ? 'New template' : template.name}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          {saveError != null && (
            <Alert variant="destructive">
              <AlertDescription>{formatError(saveError)}</AlertDescription>
            </Alert>
          )}

          {/* Family first, and disabled once a template exists: changing it would mean throwing
              every row away, which is a different template rather than an edit to this one. */}
          <div className="space-y-1.5">
            <Label>Attribute family — one only</Label>
            <div className="flex flex-wrap gap-1.5">
              {ATTRIBUTE_FAMILIES.map((f) => (
                <Button
                  key={f}
                  type="button"
                  size="sm"
                  variant={family === f ? 'default' : 'outline'}
                  disabled={template != null}
                  onClick={() => {
                    setFamily(f)
                    // Values are per-property and a property belongs to one family, so switching
                    // family cannot carry them across. Cleared explicitly rather than left to be
                    // filtered out later, so what the panel resolves is what the save will write.
                    setValues({})
                  }}
                >
                  {FAMILY_LABELS[f].singular}
                </Button>
              ))}
            </div>
            {template != null && (
              <p className="text-[11px] text-muted-foreground">
                A template&rsquo;s family is its identity — create a new one to hold a different
                attribute.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-name">Name</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Amber Key"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="template-fade">Fade (seconds)</Label>
              <Input
                id="template-fade"
                value={fadeSeconds}
                onChange={(e) => setFadeSeconds(e.target.value)}
                placeholder="default"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="template-notes">Notes</Label>
              <Input
                id="template-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="optional"
              />
            </div>
          </div>

          {isGeneric ? (
            <FamilyControls family={family} values={values} onChange={setIntent} />
          ) : (
            <PerFixtureValues template={template} />
          )}

          {/* Live against the real patch, so "usable on any fixture with colour" is something you
              can read *before* saving — including where it degrades. */}
          <TemplateResolvesTo projectId={projectId} rows={rows} />
        </SheetBody>
        <SheetFooter className={onDelete ? 'flex-row justify-between' : 'flex-row justify-end gap-2'}>
          {onDelete && (
            <Button variant="destructive" onClick={onDelete} disabled={isDeleting === true}>
              {isDeleting === true ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete
            </Button>
          )}
          <div className="flex gap-2">
            {/* Wrapped in SheetClose so Radix drives the close — which is what makes the unsaved
                changes guard fire. A plain onOpenChange(false) bypasses it. */}
            <SheetClose asChild>
              <Button variant="outline">Cancel</Button>
            </SheetClose>
            <Button onClick={handleSave} disabled={!isValid || isSaving}>
              {isSaving && <Loader2 className="size-4 animate-spin" />}
              {template == null ? 'Create template' : 'Save'}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/** The family-native control set. One per family, and nothing descriptor-driven. */
function FamilyControls({
  family,
  values,
  onChange,
}: {
  family: AttributeFamily
  values: Record<string, TemplateIntent>
  onChange: (propertyName: string, intent: TemplateIntent | null) => void
}) {
  switch (family) {
    case 'COLOUR':
      return <ColourControl value={values.rgbColour} onChange={(i) => onChange('rgbColour', i)} />
    case 'INTENSITY':
      return (
        <div className="space-y-4">
          <PercentControl
            label="Level"
            value={values.dimmer}
            onChange={(i) => onChange('dimmer', i)}
          />
          <PercentControl
            label="Strobe"
            hint="A percentage of each head's own strobe channel, not a rate: no fixture in this rig declares a Hz range, so a template cannot promise one."
            value={values.strobe}
            onChange={(i) => onChange('strobe', i)}
          />
        </div>
      )
    case 'POSITION':
      return <PositionControl value={values.position} onChange={(i) => onChange('position', i)} />
    case 'BEAM':
      return <BeamControls values={values} onChange={onChange} />
  }
}

function ColourControl({
  value,
  onChange,
}: {
  value: TemplateIntent | undefined
  onChange: (intent: TemplateIntent | null) => void
}) {
  const current = value?.kind === 'colour' ? value : null
  const hex = current?.hex ?? '#FF9D4A'
  const policy: WhitePolicy = current?.policy ?? 'extract'

  return (
    <div className="space-y-3">
      <Label>Colour</Label>
      <div className="flex items-start gap-3">
        <div className="[&_.react-colorful]:!w-40 [&_.react-colorful]:!h-32">
          <HexColorPicker color={hex} onChange={(next) => onChange({ kind: 'colour', hex: next, policy })} />
        </div>
        <div className="space-y-2 min-w-0 flex-1">
          <Input
            value={hex.toUpperCase()}
            onChange={(e) => {
              const next = e.target.value.trim()
              if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(next)) {
                onChange({ kind: 'colour', hex: next, policy })
              }
            }}
            className="font-mono"
          />
          <div
            className="h-8 rounded border border-border/60"
            style={{ background: hex }}
            aria-hidden
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>White / amber handling — on heads that have those channels</Label>
        <div className="flex flex-wrap gap-1.5">
          {WHITE_POLICIES.map((p) => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant={policy === p ? 'default' : 'outline'}
              onClick={() => onChange({ kind: 'colour', hex, policy: p })}
            >
              {WHITE_POLICY_LABELS[p].label}
            </Button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">{WHITE_POLICY_LABELS[policy].hint}</p>
      </div>
    </div>
  )
}

function PercentControl({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: TemplateIntent | undefined
  onChange: (intent: TemplateIntent | null) => void
}) {
  const current = value?.kind === 'percent' ? value.value : null

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {current == null ? '—' : `${current}%`}
          </span>
          {current != null && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              Clear
            </Button>
          )}
        </div>
      </div>
      <Slider
        min={0}
        max={100}
        step={1}
        value={[current ?? 0]}
        onValueChange={([next]) => onChange({ kind: 'percent', value: next })}
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * Pan and tilt in **degrees**, over the widest range in this rig (540° pan / 270° tilt).
 *
 * The authoring range is deliberately wider than most heads can reach: a template is not authored
 * against a fixture, so the control cannot know a limit — and the resolver clamps per head and
 * *reports* the clamp, which the panel below shows. A narrower control would silently make some
 * positions unauthorable.
 */
function PositionControl({
  value,
  onChange,
}: {
  value: TemplateIntent | undefined
  onChange: (intent: TemplateIntent | null) => void
}) {
  const current = value?.kind === 'position' ? value : null
  const pan = current?.panDeg ?? 270
  const tilt = current?.tiltDeg ?? 135

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Position</Label>
        {current != null && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            Clear
          </Button>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Pan</span>
          <span className="font-mono tabular-nums">{current == null ? '—' : `${pan}°`}</span>
        </div>
        <Slider
          min={0}
          max={540}
          step={1}
          value={[pan]}
          onValueChange={([next]) => onChange({ kind: 'position', panDeg: next, tiltDeg: tilt })}
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Tilt</span>
          <span className="font-mono tabular-nums">{current == null ? '—' : `${tilt}°`}</span>
        </div>
        <Slider
          min={0}
          max={270}
          step={1}
          value={[tilt]}
          onValueChange={([next]) => onChange({ kind: 'position', panDeg: pan, tiltDeg: next })}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Degrees, not DMX. Each head resolves these through its own range and the panel below reports
        anything it has to clamp.
      </p>
    </div>
  )
}

function BeamControls({
  values,
  onChange,
}: {
  values: Record<string, TemplateIntent>
  onChange: (propertyName: string, intent: TemplateIntent | null) => void
}) {
  const prism = values.prism?.kind === 'switch' ? values.prism.on : null

  return (
    <div className="space-y-4">
      {(['zoom', 'focus', 'iris', 'frost'] as const).map((role) => (
        <PercentControl
          key={role}
          label={role[0].toUpperCase() + role.slice(1)}
          value={values[role]}
          onChange={(i) => onChange(role, i)}
        />
      ))}

      {/* Three states, not a switch: a template that says nothing about the prism is different from
          one that says "out", and a two-state control cannot express the first. */}
      <div className="flex items-center justify-between gap-2">
        <Label>Prism</Label>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={prism === true ? 'default' : 'outline'}
            onClick={() => onChange('prism', { kind: 'switch', on: true })}
          >
            In
          </Button>
          <Button
            type="button"
            size="sm"
            variant={prism === false ? 'default' : 'outline'}
            onClick={() => onChange('prism', { kind: 'switch', on: false })}
          >
            Out
          </Button>
          {prism != null && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange('prism', null)}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Shown disabled with the reason rather than omitted. An operator looking for gobo needs to
          learn *where* it lives — a recorded look, which names a head and can hold anything that
          head has — not conclude the desk cannot do it. */}
      <div className="space-y-1.5 rounded-md border border-dashed p-2.5">
        <p className="text-[11px] font-medium text-muted-foreground">Not available on a template</p>
        {TEMPLATE_EXCLUSIONS.map((exclusion) => (
          <div key={exclusion.label} className="flex items-start gap-2 opacity-60">
            <span className="text-xs font-medium shrink-0 w-28 truncate">{exclusion.label}</span>
            <span className="text-[11px] text-muted-foreground">{exclusion.reason}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * A per-fixture template's values, read-only.
 *
 * Read-only on the same reasoning `LookDetailSheet` is: these values came from where the heads
 * actually were, and the way to change them is to put the heads there again and re-record. A grid of
 * eight editable pan/tilt pairs would be a worse version of the rig.
 */
function PerFixtureValues({ template }: { template: TemplateSummary | null }) {
  const rows = template?.rows ?? []
  return (
    <div className="space-y-1.5">
      <Label>Recorded values</Label>
      <p className="text-[11px] text-muted-foreground">
        Recorded per head. Re-record from the programmer to change them &mdash; each head holds its
        own value, which is the point of a per-fixture template.
      </p>
      <div className="rounded-md border divide-y">
        {rows.map((row) => (
          <div key={`${row.targetKey}:${row.propertyName}`} className="flex items-center gap-2 px-2 py-1.5">
            <span className="text-xs font-medium min-w-0 flex-1 truncate">{row.targetKey}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
              {row.propertyName}
            </Badge>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground shrink-0">
              {describeTemplateIntent(row.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function seedValues(template: TemplateSummary | null): Record<string, TemplateIntent> {
  if (template == null || !template.isGeneric) return {}
  const out: Record<string, TemplateIntent> = {}
  for (const row of template.rows) {
    const intent = parseTemplateIntent(row.value)
    if (intent != null) out[row.propertyName] = intent
  }
  return out
}

/** Row identity for the dirty check — the fields a save actually writes. */
function rowKey(row: TemplateRow) {
  return [row.targetType, row.targetKey, row.propertyName, row.value]
}
