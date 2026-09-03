import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AudioWaveform, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FAMILY_LABELS, type AttributeFamily } from '@/lib/attributeFamily'
import { describeTemplateIntent, templateIntentSwatch } from '@/lib/templateIntent'
import { effectSpeedLabel } from '@/components/fx/fxConstants'
import { useSpeedMasterDisplay } from '@/store/speedMasters'
import type { TemplateSummary } from '@/api/templatesApi'
import type { MouseEvent, ReactNode } from 'react'

/**
 * One row of the template library — values and effects in one list, not two sections.
 *
 * An effect belongs to a family exactly as a value does, so the family bar partitions both and a
 * second section would split the library on something the filter already answers.
 *
 * A **value** row renders from the summary alone: a template's rows come with the list, so the row
 * shows the real value rather than a placeholder and scrolling the library fetches nothing. That is
 * affordable here in a way it is not for a Look — a template is one row, or one per head for a focus
 * position.
 *
 * An **effect** row very nearly does too. `timingSource` is on the DTO precisely so a row need not
 * fetch the FX library to know whether `beatDivision` is beats or seconds; the one thing still not
 * on the summary is the speed master's *label*, which is a live value rather than a stored one and
 * comes from the bank the whole app already subscribes to.
 *
 * The row states **generic vs per fixture** in words. It is the existing deferred/bound row split
 * kept as an internal detail rather than promoted to two library sections — but an operator still
 * needs to know which they have, because applying a per-fixture template to a head it holds no entry
 * for asserts nothing for that head.
 */
export function TemplateListRow({
  template,
  onClick,
  onDelete,
  dragHandle,
}: {
  template: TemplateSummary
  onClick?: () => void
  onDelete?: () => void
  /**
   * The grip, when the list is orderable. Rendered first, before the name, and handed in rather
   * than owned: `useSortable` is the list's hook, and a row that called it would register itself
   * with a `SortableContext` that is not always there (`TemplateLayoutList`'s docblock).
   */
  dragHandle?: ReactNode
}) {
  const stop = (e: MouseEvent) => e.stopPropagation()

  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-3 py-2.5 min-h-[44px] hover:bg-accent/50 transition-colors',
        onClick && 'cursor-pointer',
      )}
      onClick={onClick}
    >
      {dragHandle}
      <div className="min-w-0 flex-1">
        <div className="font-medium text-sm truncate">{template.name}</div>
        <div className="text-[11px] text-muted-foreground truncate mt-0.5">
          {template.notes ??
            (template.kind === 'effect' ? (
              <EffectShape template={template} />
            ) : (
              describeShape(template)
            ))}
        </div>
      </div>

      <TemplateValuePreview template={template} />

      {template.family != null && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
          {FAMILY_LABELS[template.family].singular}
        </Badge>
      )}

      {template.layerCount > 0 && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
          {template.layerCount} layer{template.layerCount === 1 ? '' : 's'}
        </Badge>
      )}

      {(onClick || onDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={stop}>
            <Button variant="ghost" size="icon" className="size-7 shrink-0">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={stop}>
            {onClick && (
              <DropdownMenuItem onClick={onClick}>
                <Pencil className="size-3.5" />
                Edit
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 className="size-3.5" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

/**
 * The value, in the grid's own language: a swatch for a colour, the number for anything else.
 *
 * A per-fixture template shows the *first* row's value and how many there are, because the point of
 * one is that the values differ — showing all eight pan/tilt pairs in a library row would be noise,
 * and showing one without saying there are more would be a lie.
 */
function TemplateValuePreview({ template }: { template: TemplateSummary }) {
  // An effect has no value to preview, so the tile says *what kind of thing this is* instead — the
  // one glyph the whole desk uses for FX, tinted by family so the slot still reads as the family's.
  if (template.kind === 'effect') {
    const tint = template.family == null ? FAMILY_TINT.BEAM : FAMILY_TINT[template.family]
    return (
      <span
        className="grid size-4 shrink-0 place-items-center rounded-sm border border-border/60"
        style={{ background: tint }}
        title="Runs an effect on every head the layer names"
      >
        {/* The tints are fixed dark swatches, so the glyph is pinned light rather than left on
            `currentColor` — in the light theme that would be near-black on a near-black tile. */}
        <AudioWaveform className="size-3 text-white" />
      </span>
    )
  }

  const first = template.rows[0]
  if (first == null) return null
  const swatch = templateIntentSwatch(first.value)

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {swatch != null ? (
        <span
          className="size-4 rounded-sm border border-border/60"
          style={{ background: swatch }}
          title={describeTemplateIntent(first.value)}
        />
      ) : (
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {describeTemplateIntent(first.value)}
        </span>
      )}
      {template.rows.length > 1 && (
        <span className="text-[10px] text-muted-foreground">+{template.rows.length - 1}</span>
      )}
    </div>
  )
}

/** Family tints for the effect tile, matching `TemplateRunsOn`'s preview strip. */
const FAMILY_TINT: Record<AttributeFamily, string> = {
  INTENSITY: 'oklch(0.35 0.02 285)',
  COLOUR: 'oklch(0.32 0.09 302)',
  POSITION: 'oklch(0.32 0.07 240)',
  BEAM: 'oklch(0.34 0.06 75)',
}

/**
 * An effect row's subtitle, and the one lookup it needs.
 *
 * A **component** rather than a hook in `TemplateListRow`, so a value row mounts no subscription at
 * all: hooks cannot be conditional, so a hook would run for every row in the library to serve the
 * effect ones. It is also what lets the page render outside a Redux `Provider`, which its own test
 * does.
 *
 * The grammar stays a pure function in [describeShape]: the master's label is a live value the
 * summary cannot carry, so threading it in keeps the sentence testable without a store.
 */
function EffectShape({ template }: { template: TemplateSummary }) {
  // A WALL_CLOCK effect never reads `speedMasterUuid` — its cycle is scaled by the *rate* master,
  // and a null one means **unscaled** rather than master 1. Reading the beat master for one would
  // name a tempo link the effect does not have.
  const isWallClock = template.effect?.timingSource === 'WALL_CLOCK'
  const master = useSpeedMasterDisplay(
    isWallClock ? template.effect?.rateSpeedMasterUuid : template.effect?.speedMasterUuid,
  )
  return describeShape(template, {
    // `beatDivision` is seconds for a wall-clock effect and beats otherwise, and `timingSource` is
    // the DTO's answer to which — resolved server-side precisely so a library row does not have to
    // fetch the whole FX library to render a speed. Null where the effect type no longer resolves
    // in the registry, and the clause is then dropped rather than guessed: the two readings are a
    // tempo apart, so a confident "2 Bars" for a two-second cycle is worse than saying nothing.
    speed:
      template.effect == null
        ? null
        : effectSpeedLabel(template.effect.beatDivision, template.effect.timingSource),
    // `useSpeedMasterDisplay` returns null at master 1, which every *chip* reads as "draw nothing".
    // A subtitle is a sentence rather than a chip, so the silent default has to be spelled out or
    // the line loses a clause for the commonest case.
    master:
      master != null
        ? `M${master.index} ${master.name}`
        : isWallClock && template.effect?.rateSpeedMasterUuid == null
          ? 'unscaled'
          : 'M1',
  })
}

/**
 * The row's subtitle grammar.
 *
 * A value says what it *fits* — "Generic · any fixture with colour" — because the interesting
 * question about a value template is which heads can take it. An effect says what it *does* —
 * "Effect · Colour Pulse · 1/2 · M2 Chases" — because it fits every head of the family by
 * construction, and the interesting question is what it will run and how fast.
 */
export function describeShape(
  template: TemplateSummary,
  effectLabels?: { speed: string | null; master: string },
): string {
  if (template.kind === 'effect') {
    const effect = template.effect
    if (effect == null) return 'Effect'
    return ['Effect', effect.effectType, effectLabels?.speed, effectLabels?.master]
      .filter((part) => part != null && part !== '')
      .join(' · ')
  }
  if (template.isGeneric) {
    const family = template.family
    switch (family) {
      case 'COLOUR':
        return 'Generic · any fixture with colour'
      case 'INTENSITY':
        return 'Generic · any fixture with a dimmer'
      case 'POSITION':
        return 'Generic · any moving head'
      case 'BEAM':
        return 'Generic · any fixture with the beam role'
      default:
        return 'Generic · any fixture'
    }
  }
  const heads = new Set(template.rows.map((r) => r.targetKey)).size
  return `Per fixture · ${heads} head${heads === 1 ? '' : 's'}`
}
