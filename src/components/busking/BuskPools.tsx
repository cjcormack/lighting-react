import React from 'react'
import { useNavigate } from 'react-router'
import { AudioWaveform } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLongPress } from '@/hooks/useLongPress'
import { BuskLabel } from './BuskLabel'
import type { EffectPresence } from './buskingTypes'
import type { LookSummary } from '@/api/looksApi'
import type { TemplateSummary } from '@/api/templatesApi'
import { templateIntentSwatch } from '@/lib/templateIntent'
import { FAMILY_LABELS, type AttributeFamily } from '@/lib/attributeFamily'
import { effectSpeedLabel } from '@/components/fx/fxConstants'
import { useSpeedMasterDisplay } from '@/store/speedMasters'

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
  /**
   * What it holds, in a line's worth of text.
   *
   * A node rather than a string because an **effect** template's line names its speed master, which
   * is a live value: `EffectPadDetail` is a component for the reason `EffectShape` in
   * `components/templates/TemplateListRow.tsx` is one — hooks cannot be conditional, so a hook here
   * would make every value pad in the library subscribe to the master bank to serve the few that
   * need it.
   */
  detail: React.ReactNode
  kind: 'look' | 'template'
  /**
   * True for a template holding an **effect** rather than values (fx-templates D1). Drives the
   * wave glyph on the pad's face and nothing else — the column no longer splits on it.
   *
   * Not `kind`, which is already taken here and means something else — a pad is a `'look' | 'template'`,
   * while `TemplateSummary.kind` is `'value' | 'effect'`. Two fields of that name on one object is
   * how a filter ends up reading the wrong one.
   */
  isEffect?: boolean
  /**
   * Which column a template pad lands in. Null on a Look, which spans families by nature and has
   * its own section for exactly that reason.
   */
  family: AttributeFamily | null
  /**
   * The template group this pad sits in, or null at top level. Consecutive pads sharing a group
   * are drawn as one bordered cluster (`TemplateGroupCluster`); the caller hands them over already
   * contiguous, in the library's layout order, because `buildTemplateLayout` is where the tree is
   * composed and this grid only walks it.
   */
  group?: { id: number; name: string } | null
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
 *
 * **Within a column, the library's own order, values and effects interleaved.** fx-templates D10
 * split each column at an *Effects* hairline; that went when the order became the operator's to
 * set (`/templates` drags), because a hairline the operator cannot move is a second ordering
 * fighting the one they chose. An effect pad is a pad like any other — same component, same
 * presence ladder, same long-press — and only its wave glyph says what it holds. There is no sort
 * here and none is added: the caller's array order is the contract, and it comes from
 * `buildTemplateLayout`.
 *
 * **A template group is a bordered cluster** inside its family's column (`TemplateGroupCluster`),
 * at the position the layout gives it. Consecutive pads sharing a `group` are coalesced into one;
 * the group's exclusivity is the server's business (a press takes its own targets off every
 * sibling, narrowing one that only overlaps), so the cluster draws nothing the presence ladder does
 * not already show.
 *
 * The programmer's `TemplateStrip` still draws its hairline — a different surface with a different
 * ask, and its own test pins the order. Recorded here so the divergence reads as chosen.
 */
const TEMPLATE_COLUMNS: readonly AttributeFamily[] = ['COLOUR', 'POSITION', 'BEAM', 'INTENSITY']

/** A column's pads, with consecutive same-group pads folded into one run. */
type ColumnRun =
  | { kind: 'pad'; item: PadItem }
  | { kind: 'group'; id: number; name: string; items: PadItem[] }

function columnRuns(items: readonly PadItem[]): ColumnRun[] {
  const runs: ColumnRun[] = []
  for (const item of items) {
    const group = item.group ?? null
    const last = runs[runs.length - 1]
    if (group == null) {
      runs.push({ kind: 'pad', item })
    } else if (last?.kind === 'group' && last.id === group.id) {
      last.items.push(item)
    } else {
      runs.push({ kind: 'group', id: group.id, name: group.name, items: [item] })
    }
  }
  return runs
}

function TemplateColumns({ items }: { items: PadItem[] }) {
  const templates = items.filter((item) => item.kind === 'template')

  return (
    <div className="grid grid-cols-1 @[20rem]:grid-cols-2 @[48rem]:grid-cols-4 gap-3">
      {TEMPLATE_COLUMNS.map((family) => {
        const inFamily = templates.filter((item) => item.family === family)
        return (
          <div key={family} className="flex flex-col gap-2">
            {/* The family heading stays this column's first child: `BuskPools.test.tsx` identifies a
                column by it, and anything inserted above would silently rename every column. */}
            <span className="text-[10px] font-semibold text-muted-foreground">
              {FAMILY_LABELS[family].singular}
            </span>
            {columnRuns(inFamily).map((run) =>
              run.kind === 'pad' ? (
                <LookPadButton
                  key={run.item.key}
                  item={run.item}
                  presence={run.item.presence}
                  onToggle={run.item.onToggle}
                  onLongPress={run.item.onEdit}
                />
              ) : (
                <TemplateGroupCluster key={`group-${run.id}`} name={run.name} items={run.items} />
              ),
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * A template group on the pad grid: its name as a tiny label, its pads inside one border.
 *
 * A `<div>`, not a button and not `BuskLabel`: the pool's inert-when-nothing-selected rule is a
 * descendant-button selector, and `BuskLabel` is the *region* label — three regions of one
 * instrument is what its docblock keeps this surface reading as. The border is the whole
 * affordance; pressing a pad in it is the same press as anywhere else, and the fact that its
 * siblings go dark is the server's answer, read back through the presence ladder.
 */
function TemplateGroupCluster({ name, items }: { name: string; items: PadItem[] }) {
  return (
    <div
      data-template-group={name}
      className="flex flex-col gap-1.5 rounded-md border border-border/80 bg-muted/20 p-1.5"
    >
      <span className="px-0.5 text-[10px] font-medium text-muted-foreground truncate" title={name}>
        {name}
      </span>
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
        {/* An effect template has no value to preview, so the glyph the whole desk uses for FX
            stands where a swatch would — the same substitution `TemplateListRow` and `TemplateStrip`
            make, so one thing looks like itself in all three places. */}
        {item.isEffect === true && <AudioWaveform className="size-3 shrink-0 text-muted-foreground" />}
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
 * An **effect** template pad's detail line: `Colour Pulse · ½ · M2`.
 *
 * A component rather than a string built in `BuskingView`, because the master's label is a live
 * value and the hook that reads it cannot be called in a loop over the library. That is the same
 * split `EffectShape` makes in `components/templates/TemplateListRow.tsx`, and it buys the same
 * thing: a value pad mounts no subscription at all.
 *
 * No leading `Effect ·` — the hairline above the pad already says which half of the column this is,
 * where the library row has no such context and needs the word.
 */
export function EffectPadDetail({ template }: { template: TemplateSummary }) {
  // A WALL_CLOCK effect never reads `speedMasterUuid`: its cycle is scaled by the *rate* master, and
  // a null one means **unscaled** rather than master 1. Reading the beat master here would name a
  // tempo link the effect does not have.
  const isWallClock = template.effect?.timingSource === 'WALL_CLOCK'
  const master = useSpeedMasterDisplay(
    isWallClock ? template.effect?.rateSpeedMasterUuid : template.effect?.speedMasterUuid,
  )
  if (template.effect == null) return 'Effect'
  const speed = effectSpeedLabel(template.effect.beatDivision, template.effect.timingSource)
  // A null `timingSource` means the stored `effectType` no longer resolves in this desk's registry
  // — an import from a desk with script-registered effects. **Both** clauses go then, not just the
  // speed: `isWallClock` is false for a null as well as for a beat effect, so naming the beat
  // master would state a tempo link a wall-clock effect does not have, which is the mistake the
  // split above exists to avoid. Say nothing rather than pick the likelier of two wrong answers.
  //
  // `useSpeedMasterDisplay` is otherwise silent at master 1, which every *chip* reads as "draw
  // nothing". A detail line is a sentence, so the commonest case is spelled out or the line loses a
  // clause exactly when it is least surprising. It is also silent while the bank is still arriving,
  // so a pad can read "M1" for a frame before settling — the same transient the library row has,
  // and not worth a second query shape to remove.
  const masterLabel =
    template.effect.timingSource == null
      ? null
      : master
        ? `M${master.index}`
        : isWallClock && template.effect.rateSpeedMasterUuid == null
          ? 'unscaled'
          : 'M1'
  return [template.effect.effectType, speed, masterLabel].filter(Boolean).join(' · ')
}

/**
 * The colour a template pad draws beside its name, or null.
 *
 * An **effect** template is excluded too, and deliberately rather than incidentally: it holds no
 * rows at all, so `rows.length !== 1` already answers null, and its pad draws the wave glyph in the
 * swatch's place instead. Don't relax the row-count clause without putting the kind check back.
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
