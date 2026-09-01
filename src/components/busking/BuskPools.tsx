import React from 'react'
import { useNavigate } from 'react-router'
import { cn } from '@/lib/utils'
import { useLongPress } from '@/hooks/useLongPress'
import { BuskLabel } from './BuskLabel'
import type { EffectPresence } from './buskingTypes'
import type { LookSummary } from '@/api/looksApi'
import type { TemplateSummary } from '@/api/templatesApi'
import { templateIntentSwatch } from '@/lib/templateIntent'
import { FAMILY_LABELS, type AttributeFamily } from '@/lib/attributeFamily'

interface BuskPoolsProps {
  hasSelection: boolean
  /**
   * The named things a pad can toggle onto the selection: templates, which fill the four family
   * columns, and Looks, which get a section of their own below them.
   *
   * The Looks here are **deferred ones only**, filtered by the caller. A bound Look names its own
   * fixtures, so the toggle route offers none of its rows and a pad for it would fire nothing.
   */
  padItems: PadItem[]
  /**
   * The cue stacks and pinned-cue pads, drawn beside the Looks pool.
   *
   * A node rather than the data, because a pad grid has no business knowing about the show
   * transport: everything it needs is a run cursor, and those live one hook up. Passing the built
   * column keeps `useShowTransport` mounted exactly once on this page — the Prompt Book's two
   * instances are what `useShowBarProps` exists to have stopped happening.
   */
  cueColumn?: React.ReactNode
  currentProjectId: number | undefined
}

/**
 * The busk view's pad pools: templates in four family columns, then Looks beside the cue column.
 *
 * **Those are all there is, and the deletion is deliberate.** This component was `EffectPad`, and it
 * also drew three pools of ad-hoc effect pads (dimmer / colour / position), a Controls pool of
 * hold-to-slide property pads writing straight to the programmer, and a Time beat-division toggle
 * that parameterised whatever those two created. All of it went: a busk pad presses a *named thing*
 * from the library onto the selection, and a second grid minting anonymous FX instances with their
 * own timing model made two instruments share a page. `busking-view-design/Main.dc.html` draws these
 * pools and nothing else.
 *
 * What that costs, said plainly so it is not rediscovered as a bug: an ad-hoc effect now reaches the
 * stage through a Look with deferred effects, a cue, or the Programmer's `+ Effect`, and a raw level
 * through an intensity template or the Programmer. Nothing on this page mints an FX instance.
 */
export function BuskPools({ hasSelection, padItems, cueColumn, currentProjectId }: BuskPoolsProps) {
  return (
    // The dim-when-nothing-selected state lives on each `CategorySection`, not here — see its
    // docblock. It has to, now that the cue column shares this scroller: firing a cue has nothing
    // to do with the target selection, and a subtree-wide rule would have made the stack cards and
    // pinned pads inert whenever no fixture happened to be selected.
    <div className="@container flex flex-col h-full overflow-y-auto px-4 pt-1 pb-4">
      {!hasSelection && (
        <p className="mt-2 shrink-0 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Toggle fixtures or groups above — pads apply to the selection. Lit pads are already on
          stage and stay live.
        </p>
      )}

      <CategorySection label="Templates" dimmed={!hasSelection}>
        <TemplateColumns items={padItems} />
      </CategorySection>

      {/* Looks at 2fr beside the cue column's 3fr, the mock's split. They sit side by side
          rather than stacked because the cue column is the one region an operator watches
          while pressing something else — a stack card's state line has to stay on screen
          when the pointer is in the Looks pool. Below the breakpoint they stack, which is
          the only arrangement a phone has room for. */}
      <div
        className={cn(
          'grid grid-cols-1 gap-4',
          // Only split the row when there is something to put in the second column: with no
          // cue column the 3fr track would still be reserved, squeezing the Looks pool into
          // 40% of the width beside an empty gap.
          cueColumn && '@[52rem]:grid-cols-[2fr_3fr]',
        )}
      >
        {/* Its own `@container`, and `min-w-0` so a long Look name cannot push the
            track wider than its share. Without the container the grid inside reads the
            *scroller's* width, so a 55rem pad area gives the Looks pool four columns
            across the 21rem it actually got. */}
        <CategorySection label="Looks" dimmed={!hasSelection} className="@container min-w-0">
          <LookGrid
            items={padItems.filter((i) => i.kind === 'look')}
            currentProjectId={currentProjectId}
          />
        </CategorySection>
        {cueColumn}
      </div>
    </div>
  )
}

/**
 * One pool of pads, with its heading — and the place the empty-selection state is expressed.
 *
 * **Dimmed and inert rather than replaced by a placeholder.** This used to be a centred "Select a
 * group or fixture" page, which hid the entire library behind a step the operator had not been
 * shown yet — seeing what there *is* to press is most of what makes a pad grid learnable. Nothing
 * can be pressed by mistake: presence is `none` for every pad with an empty selection, so there is
 * nothing lit to release either.
 *
 * Two things about *where* the rule sits, both learned the hard way:
 *
 * - **On the buttons, not on a container.** `pointer-events-none` on an element that scrolls takes
 *   it out of hit-testing, so the wheel and a touch drag find no scrollable ancestor and the
 *   library the operator was just invited to read is stuck at its first screenful. Every
 *   interactive thing in a pool is a `<button>` (the pads, the manage links), so the descendant
 *   selector covers the same ground.
 * - **Per section, not on the whole scroller.** Session 4 put the cue stacks and pinned-cue pads in
 *   the same scroller, and those answer to the playhead rather than to the selection. A subtree
 *   rule would have made GO inert whenever no fixture happened to be selected.
 */
function CategorySection({
  label,
  dimmed,
  className,
  children,
}: {
  label: string
  /** True when no target is selected: this pool is showable but not pressable. */
  dimmed?: boolean
  /**
   * Extra classes on the pool's own root. Exists for the one pool that is a *grid track* rather
   * than a full-width band: a track has to be its own `@container`, or the pad grid inside it
   * sizes itself against the whole scroller and packs four columns into two fifths of it.
   */
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'mt-4 first:mt-3.5 transition-opacity',
        dimmed && 'opacity-55 select-none [&_button]:pointer-events-none',
        className,
      )}
      aria-disabled={dimmed || undefined}
    >
      <BuskLabel className="mb-2">{label}</BuskLabel>
      {children}
    </div>
  )
}

/**
 * One pad: a named thing you toggle onto the current selection.
 *
 * Deliberately not "a Look" any more. Session 3 split the library in two and **both halves belong on
 * a pad** — a template is a named value, which is exactly what a palette bank was, and a Look with
 * deferred effects is a chase you point at a selection. They share one grid because they are one
 * gesture from the operator's side; only the column it lands in says which.
 */
export interface PadItem {
  key: string
  name: string
  notes: string | null
  /** What it holds, in a line's worth of text. */
  detail: string
  kind: 'look' | 'template'
  /**
   * Which column a template pad lands in. Null on a Look, which spans families by nature and has
   * its own section for exactly that reason.
   */
  family: AttributeFamily | null
  /** The colour a colour template resolves to, for the pad's swatch. Null when there isn't one. */
  swatch: string | null
  presence: EffectPresence
  onToggle: () => void
  onEdit: () => void
}

/**
 * The four family columns of the template pool.
 *
 * A template is in **exactly one** family — derived from its rows, validated at the write boundary
 * — so four columns is an exact partition of the pool rather than a filter over it, and every pad
 * has one right home. That is the same fact that put the family filter on `/templates` and kept it
 * off `/looks`; here it buys the operator a spatial memory instead of a dropdown, which is what a
 * palette bank was always for.
 *
 * The order is the mock's — colour first, because it is the family a busking operator reaches for
 * most — rather than `ATTRIBUTE_FAMILIES`'. Columns render their heading even when empty, so the
 * four positions stay put as the library fills up.
 *
 * A template with a null `family` has no column and is dropped. The write boundary does not allow
 * one, so this is a guard rather than a case.
 */
const TEMPLATE_COLUMNS: readonly AttributeFamily[] = ['COLOUR', 'POSITION', 'BEAM', 'INTENSITY']

function TemplateColumns({ items }: { items: PadItem[] }) {
  const templates = items.filter((item) => item.kind === 'template')

  return (
    <div className="grid grid-cols-1 @[20rem]:grid-cols-2 @[48rem]:grid-cols-4 gap-3">
      {TEMPLATE_COLUMNS.map((family) => (
        <div key={family} className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold text-muted-foreground">
            {FAMILY_LABELS[family].singular}
          </span>
          {templates
            .filter((item) => item.family === family)
            .map((item) => (
              <LookPadButton
                key={item.key}
                item={item}
                presence={item.presence}
                onToggle={item.onToggle}
                onLongPress={item.onEdit}
              />
            ))}
        </div>
      ))}
    </div>
  )
}

function LookGrid({
  items,
  currentProjectId,
}: {
  items: PadItem[]
  currentProjectId: number | undefined
}) {
  const navigate = useNavigate()

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 @[20rem]:grid-cols-2 @[28rem]:grid-cols-3 @[48rem]:grid-cols-4 gap-2">
        {items.map((item) => (
          <LookPadButton
            key={item.key}
            item={item}
            presence={item.presence}
            onToggle={item.onToggle}
            onLongPress={item.onEdit}
          />
        ))}
      </div>
      {/* Links out rather than a "New" pad. Neither entity is authored from a pad grid: a Look is
          recorded from the programmer, and a template has a family-native editor of its own. A create
          affordance here would have to pick one, and would be the worse of two places to do it. */}
      {currentProjectId && (
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => navigate(`/projects/${currentProjectId}/templates`)}
          >
            Manage templates →
          </button>
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => navigate(`/projects/${currentProjectId}/looks`)}
          >
            Manage looks →
          </button>
        </div>
      )}
    </div>
  )
}

function LookPadButton({
  item,
  presence,
  onToggle,
  onLongPress,
}: {
  item: PadItem
  presence: EffectPresence
  onToggle: () => void
  onLongPress: () => void
}) {
  const { handlers } = useLongPress({ onLongPress, onPress: onToggle })

  return (
    <button
      {...handlers}
      // The notes are off the pad's face — the mock has room for a name and one line of detail, and
      // a third line is what pushed the pad past its drawn height. They are still readable here.
      title={item.notes ?? item.name}
      className={cn(
        'relative flex flex-col items-center justify-center rounded-lg border p-2 text-center transition-all',
        'min-h-[56px] select-none touch-manipulation',
        'active:scale-95',
        presence === 'none' && 'border-border bg-card hover:bg-accent/50',
        presence === 'some' && 'border-primary/40 bg-primary/10 hover:bg-primary/15',
        presence === 'all' && 'border-primary bg-primary/20 ring-1 ring-primary/50 hover:bg-primary/25',
      )}
    >
      <span className="flex items-center gap-1.5">
        {/* Only a colour template that resolves to one colour has a swatch — see `swatch`'s
            derivation in `BuskingView`. Everything else names itself. */}
        {item.swatch && (
          <span
            aria-hidden
            className="size-3 shrink-0 rounded shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]"
            style={{ background: item.swatch }}
          />
        )}
        <span
          className={cn(
            'text-sm font-medium leading-tight',
            presence !== 'none' ? 'text-primary' : 'text-foreground',
          )}
        >
          {item.name}
        </span>
      </span>
      <span className="mt-0.5 text-[10px] leading-tight text-muted-foreground line-clamp-1">
        {item.detail}
      </span>
      {presence !== 'none' && (
        <div
          className={cn(
            'absolute top-1.5 right-1.5 size-2 rounded-full',
            presence === 'all' ? 'bg-primary' : 'bg-primary/50',
          )}
        />
      )}
    </button>
  )
}

/**
 * What a Look holds, in a line's worth of text.
 *
 * Effects and rows are counted apart because they behave differently on a pad: an effect keeps
 * running until the pad is pressed again, while a static row is a value the toggle writes and holds.
 * A Look with no effects at all also never lights the pad's active ring — presence is read from the
 * running effects — so saying "2 values" rather than "0 effects" is the difference between a pad
 * that looks broken and one that looks like what it is.
 */
export function describeLookContents(look: LookSummary): string {
  const parts: string[] = []
  if (look.effectCount > 0) {
    parts.push(`${look.effectCount} ${look.effectCount === 1 ? 'effect' : 'effects'}`)
  }
  if (look.rowCount > 0) {
    parts.push(`${look.rowCount} ${look.rowCount === 1 ? 'value' : 'values'}`)
  }
  return parts.length === 0 ? 'empty' : parts.join(' · ')
}

/**
 * The colour a template pad draws beside its name, or null.
 *
 * The two exclusions are the ones `isOfferable` makes in `components/fx/FxColourTemplates.tsx`,
 * and for the same reason rather than by coincidence. A **per-fixture** template holds one colour
 * per head, so there is no single colour for a swatch to claim — its detail line already says
 * "{n} heads", which is the honest answer. A **multi-row** template holds several, and drawing
 * `rows[0]` under a name that covers all of them would state one of them as the whole thing,
 * silently.
 *
 * `templateIntentSwatch` returns null for a non-colour intent, so the family check is implicit —
 * but a position template resolving to a hex would be a bug worth seeing rather than hiding, and
 * this stays a pure read either way: the client half of the intent grammar parses and never
 * resolves (`lib/templateIntent.ts`).
 */
export function templateSwatch(template: TemplateSummary): string | null {
  if (!template.isGeneric || template.rows.length !== 1) return null
  return templateIntentSwatch(template.rows[0].value)
}
