import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Button } from '@/components/ui/button'
import { AudioWaveform, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useScrollEdges } from '@/hooks/useScrollEdges'
import { useLongPress } from '@/hooks/useLongPress'
import type { CellRef } from '@/components/fixtures-list/cellSelectionModel'
import { type AttributeFamily } from '@/lib/attributeFamily'
import { templateRowsSwatch, describeTemplateIntent } from '@/lib/templateIntent'
import {
  useApplyTemplateMutation,
  useTemplateListQuery,
  useToggleTemplateMutation,
} from '@/store/templates'
import { formatError } from '@/lib/formatError'
import { NewTemplateFromSelectionSheet } from './NewTemplateFromSelectionSheet'
import type { TemplateSummary, TemplateTarget } from '@/api/templatesApi'

/**
 * The template strip: the templates that fit what you have selected, one press away.
 *
 * **The selection is the filter**, which is the whole design: select colour cells and only colour
 * templates are offered, so there is no picker to open and no family dropdown to get wrong. It reads
 * the *cell* selection where there is one (the marquee says which attribute you mean) and falls back
 * to what the selected fixtures **can take** where there is not — a rig of RGB pars with no mover
 * on it is offered no position template, because "does this head have the family at all" is the
 * first half of template compatibility (fx-templates D6).
 *
 * The **second half is the emitters**. A template may name `white`, `amber` or `uv` outright, and a
 * head without that emitter refuses the *whole* template rather than the row — so an RGB-only par is
 * offered no "Amber Key", even though amber is COLOUR and the par has colour. The family alone
 * cannot draw that line: the hex and all three emitters are one family.
 *
 * **The selection is the target too**, by the same rule: a marquee over three colour cells lands
 * the press on those three heads, whatever the checkboxes name, and a row selection lands it on
 * the rows. The container derives all three (`templateTargets`, `targetFamilies`, `targetEmitters`
 * on `renderToolbar`) because only it knows which rows the cells sit on; the strip reads nothing
 * from Redux.
 *
 * **Two gestures, because there are two things you might mean**, and they are the reason a template
 * is not just a value you paste:
 *
 *  - **click** sets literal values in Local. Retuning the template later does not move them. This is
 *    the busking gesture, and it is why the retired `ref:` grammar is not missed here.
 *  - **⌥click — or a hold, which is the same press on a touchscreen** — adds a layer that
 *    *tracks* it, targeted at the selection and masked to the template's family. Retune the
 *    template and every layer moves. The hold is stated on the chip's `title` beside ⌥click, and
 *    the reason it is a hold rather than a Set/Track switch is in `TemplateChip`.
 *
 * The last chip records the selection as a new template, which is how the library fills up without
 * anyone visiting it. It is drawn **outside** the scroller, pinned to its right: it is the one
 * control here that is not a member of the library, and a chip that fills the library must not be
 * the chip that scrolls off the end of it.
 *
 * **It renders nothing with no targets, which is a reversal.** Until session 2 of the space plan
 * the strip showed the *whole* library with nothing selected and a press toasted "select the
 * fixtures this should land on first". That was the single most expensive line on the page: a row
 * of chips — wrapping to four rows on a real library — spending 43px of a grid's height on a
 * gesture that could only fail. The library is browsed on `/templates`; this strip is where a
 * template is *pressed*, and a press needs a target (space plan D3). The `targets.length === 0`
 * guard in `press` stays as defence in depth, and so does `New`'s disabled arm — neither is
 * reachable through the UI now, and both are one careless host away from being reachable again.
 *
 * **It is a row of the selection bar, not a band of its own.** It renders a leading hairline, then
 * the chips in a `flex-1 min-w-0 overflow-x-auto` scroller under a right-edge mask, then `New` —
 * three siblings of one flex line that `ProgrammerGrid` owns, which is why there is no wrapper
 * element around them. The hairline belongs to the strip rather than to the bar so that the two
 * appear and disappear together: the bar renders whenever anything is selected, and the strip
 * whenever a press has somewhere to land, and those are not quite the same condition (a selected
 * group row with no visible members resolves to no targets at all).
 */
export function TemplateStrip({
  projectId,
  cells,
  askedFamilies,
  targets,
  targetFamilies,
  targetEmitters = [],
}: {
  projectId: number
  /** The marquee's cells. Empty when the operator has selected rows but not cells. */
  cells: readonly CellRef[]
  /**
   * The families those cells name, already derived by the bar for its own badge — `null` when
   * there are no cells. Passed in rather than recomputed so the badge and these chips answer from
   * one evaluation: they sit a few pixels apart, and a marquee drag mints a fresh `cells` array
   * every animation frame, so deriving it twice was two passes per frame to say one thing.
   */
  askedFamilies: readonly AttributeFamily[] | null
  /** Where a press lands: the cells' heads when there is a marquee, the selected rows' otherwise. */
  targets: readonly TemplateTarget[]
  /** The families those heads have at all. Empty when nothing is selected. */
  targetFamilies: readonly AttributeFamily[]
  /** The bundled emitters those heads have — `white` / `amber` / `uv`. Empty when none does. */
  targetEmitters?: readonly string[]
}) {
  const { data: templates } = useTemplateListQuery({ projectId }, { skip: !projectId })
  const [applyTemplate] = useApplyTemplateMutation()
  const [toggleTemplate] = useToggleTemplateMutation()
  const [newOpen, setNewOpen] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)

  /**
   * The families the selection is asking about.
   *
   * From the **cells** when there are any — a marquee across the Colour column means colour, and
   * nothing else. That arm arrives as `askedFamilies` from the bar, which needs the same answer
   * for its badge, so the filter and the label beside it answer from one evaluation rather than
   * two that could drift. With rows selected but no cells there is no attribute in the gesture, so
   * the answer is what those heads *have*: every family they could take, none they could not.
   *
   * The third arm — `null`, "no question yet" — no longer reaches the screen: with no targets the
   * strip renders nothing. It still *runs*, because hooks execute before the early return that
   * discards their result, so this is dead output rather than dead code — do not "simplify" it on
   * the assumption that the branch cannot be taken. It is kept because `null` is also what the
   * *sheet* below is handed for "the operator named no attribute", which the rows-only arm
   * produces, and collapsing the two would make that prop lie.
   */
  const families = useMemo<readonly AttributeFamily[] | null>(() => {
    if (askedFamilies != null) return askedFamilies
    if (targets.length > 0) return targetFamilies
    return null
  }, [askedFamilies, targets.length, targetFamilies])

  const visible = useMemo(() => {
    // The library's own order, which is by name — the same list `/templates` draws. There is no
    // operator-set order to honour any more: order belongs to a pad's place in a busk bank.
    const all = templates ?? []
    if (families == null) return all
    return all.filter(
      (t) =>
        t.family != null &&
        families.includes(t.family) &&
        // Every emitter the template names has to be somewhere in the selection. A **union** over
        // the heads, matching how `targetFamilies` is built: with a hex and a par selected together
        // the amber template is still offered, and the par reports a skip on the press. Requiring
        // every head to have it would hide most of the library from most mixed selections.
        //
        // `?? []` is not defensive noise. `templateList` has no `transformResponse`, so this field
        // is whatever the desk sent — and lighting7 hot-swaps changed handler bodies but *not* new
        // response fields, so a desk mid-upgrade serves rows without it. Reading `.every` off
        // undefined there would take out the whole programmer toolbar until someone restarted the
        // backend. Absent means "names no emitter", which is what every template predating this
        // field actually is.
        (t.requiredEmitters ?? []).every((emitter) => targetEmitters.includes(emitter)),
    )
  }, [templates, families, targetEmitters])

  /**
   * Values, then a hairline, then effects (fx-templates D10) — the busk column's split, sideways.
   *
   * Name order holds inside each half; nothing is sorted here and nothing was before. The
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
            targets: [...targets],
            propertyMask: template.family ?? undefined,
          })
        : applyTemplate({ projectId, templateId: template.id, targets: [...targets] })
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
          //
          // Gated on the template's **kind**, not on the field being present: the desk answers a
          // value press with `effectIds: []` as well, and reading that as "nothing started" put a
          // failure toast on every successful value press. Found on a desk, not by a test —
          // the mock here answered without the field.
          if (template.kind === 'effect' && 'effectIds' in result && result.effectIds != null) {
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

  // The chips are a *scroller*, so the mask has to be conditional. A fade drawn over content that
  // fits says "there is more to the right" when there is not, and after the two-flex-1 fix below
  // the scroller is wide enough that a short library routinely fits — so the false affordance
  // would have been the common case, not the edge one. Measured rather than guessed: neither the
  // chip count nor the container width predicts it on its own.
  // `measureOnRender`: the chip list changes without the scroller resizing, and the mask has to
  // be right in the frame the chips land in. See `useScrollEdges`.
  const { overflows, attach } = useScrollEdges(scrollerRef, { measureOnRender: true })

  // D3. Not "and the library is empty" as well: a press needs a target whatever the library holds,
  // and the family badge, the counts and Deselect beside it still have something to say without it.
  //
  // **The sheet is deliberately OUTSIDE this guard.** It is rendered below, past the early return,
  // because it holds a draft: the desk selection is server-owned and shared (another client, a
  // MIDI select button, a group whose membership changed), so `targets` can empty while the
  // operator is halfway through typing a template name. Unmounting the sheet with the strip
  // discarded that name silently — `Sheet`'s `unsavedChanges` guard only intercepts the closes
  // *Radix* drives (Escape, outside-click, the X), never a parent unmount, so not even the
  // "Discard changes?" prompt would have fired. The old guard hid this: it also required the
  // library to be empty, which on a real project it never is.
  const strip =
    targets.length === 0 ? null : (
      <>
        {/* The hairline that separates what is selected from what can be pressed onto it. Drawn
            here rather than by the bar so it cannot outlive the chips — see the doc comment. The
            class is the internal separator's, verbatim, so this file has one hairline style and
            `SurfaceLibrary`'s "TemplateStrip's hairline, verbatim" keeps naming one thing. */}
        <span aria-hidden className={HAIRLINE_CLASS} />
        {/* The chips, on one line, scrolling sideways under a fade rather than wrapping. Wrapping
            is what made the old band cost four rows on a forty-template library; the mask says
            there is more to the right without spending a scrollbar's height on saying so, and the
            row is short enough that a trackpad or a shift-wheel is the whole gesture.

            `min-w-0` is load-bearing beside `flex-1`: a flex item's default `min-width: auto` is
            its content, so without it the chips would push the bar wider than the grid instead of
            scrolling inside it, and the mask would never have anything to fade. */}
        <div
          // `attach`, not `scrollerRef` — see `useScrollEdges`. This scroller mounts with the
          // selection, so the hook has to be told when it arrives.
          ref={attach}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto',
            overflows && [
              '[mask-image:linear-gradient(90deg,#000_92%,transparent)]',
              '[-webkit-mask-image:linear-gradient(90deg,#000_92%,transparent)]',
            ],
            // The scrollbar is the horizontal one on a 26px-tall row: showing it would take a
            // third of the chips' height. The overflow is still scrollable by wheel, trackpad
            // and keyboard.
            '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          )}
        >
          {visible.length === 0 && (templates?.length ?? 0) > 0 && (
            <span className="whitespace-nowrap text-[11px] text-muted-foreground">
              No template fits what is selected.
            </span>
          )}

          {valueChips.map((template) => (
            <TemplateChip key={template.id} template={template} onPress={press} />
          ))}

          {valueChips.length > 0 && effectChips.length > 0 && (
            <span aria-hidden className={HAIRLINE_CLASS} />
          )}

          {effectChips.map((template) => (
            <TemplateChip key={template.id} template={template} onPress={press} />
          ))}
        </div>

        {/* The chip that fills the library, pinned outside the scroller. No `disabled` arm: the
            guard above has already returned, so it could only ever have rendered enabled, and a
            dead conditional whose `title` no longer explains the state it guards is worse than no
            conditional. `press`'s guard is the one that stays — it is the only one a future host
            rendering this component differently could still reach. */}
        <Button
          variant="outline"
          size="sm"
          className="h-[26px] shrink-0 gap-1 border-dashed px-2 text-xs"
          title="Record what you have selected as a new template"
          onClick={() => setNewOpen(true)}
        >
          <Plus className="size-3.5" />
          New
        </Button>
      </>
    )

  return (
    <>
      {strip}
      <NewTemplateFromSelectionSheet
        open={newOpen}
        onOpenChange={setNewOpen}
        projectId={projectId}
        // The *asked* families, not the capability list: with rows selected and no cells the
        // gesture named no attribute, and the sheet should ask rather than pre-pick one of several.
        families={cells.length > 0 ? families : null}
        targets={targets}
      />
    </>
  )
}

/**
 * One hairline style for this file: the bar's leading separator and the values/effects divider.
 * They are the same kind of line at the same rank, and `SurfaceLibrary`'s hairline copies this
 * one by name — two sizes here would make that reference ambiguous about which it meant.
 */
const HAIRLINE_CLASS = 'mx-0.5 h-5 w-px shrink-0 bg-border'

function TemplateChip({
  template,
  onPress,
}: {
  template: TemplateSummary
  onPress: (template: TemplateSummary, additive: boolean) => void
}) {
  const swatch = templateRowsSwatch(template.rows)
  // The hold is ⌥click's touch twin (`PD-TRACKING-GESTURE-TOUCH`): a phone has no Option key, so
  // without it the tracking half of the design was unreachable from the surface built for it. It
  // is a hold and not a mode switch in the bar because ⌥ is per-press, and a sticky Set/Track
  // toggle is the kind of state an operator forgets they set. A hold means the press's second
  // meaning everywhere on the desk — a pad's hold inspects it, a speed card's hold is its fader,
  // the grid's hold is its marquee — and the chip and the grid never share a point, so the hold
  // cannot mean two things anywhere a finger lands. `consumeLongPress` swallows the click the
  // release then generates, or a hold would add the layer *and* set the literals.
  //
  // **Touch and pen only — the same gate the grid's marquee arm makes, and the same list.** A
  // mouse has ⌥, so a mouse hold would be a second, silent door to the tracking mutation: an
  // operator who paused on a chip for half a second would get a layer where they meant literals,
  // and nothing on screen says which happened. The busk pads keep their mouse hold because theirs
  // opens an inspector; this one changes the rig.
  const { handlers: hold, consumeLongPress } = useLongPress({
    onLongPress: () => onPress(template, true),
  })
  const handlers = {
    ...hold,
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') hold.onPointerDown(e)
    },
  }
  return (
    <button
      type="button"
      {...handlers}
      onClick={(e) => {
        if (consumeLongPress()) return
        onPress(template, e.altKey)
      }}
      title={
        // The two gestures, stated on the chip rather than left to be discovered: ⌥click is not a
        // thing an operator guesses, and it is the one that creates a dependency. For an effect the
        // click half says **a copy**, which is the whole difference between the two: the instance a
        // click mints carries no `LayerSource`, so retuning the template afterwards never moves it.
        template.kind === 'effect'
          ? `Click to run a copy of “${template.name}” on the selection · hold or ⌥click to add a layer that tracks it`
          : `Click to set these values · hold or ⌥click to add a layer that tracks “${template.name}”`
      }
      className={cn(
        // `shrink-0` is what makes the row a scroller rather than a squeezer: without it flex
        // would compress every chip to fit and the mask would never fade anything.
        'flex h-[26px] shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors',
        'hover:bg-accent/60 active:scale-95',
      )}
    >
      {/* An effect template holds no rows, so there is no value to preview — the glyph the whole
          desk uses for FX says what the press will do instead of a blank gap. */}
      {template.kind === 'effect' ? (
        <AudioWaveform className="size-3 shrink-0 text-muted-foreground" />
      ) : swatch != null ? (
        <span className="size-3 rounded-sm border border-border/60" style={{ background: swatch }} />
      ) : (
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {template.rows[0] != null ? describeTemplateIntent(template.rows[0].value) : ''}
        </span>
      )}
      <span className="truncate max-w-32">{template.name}</span>
    </button>
  )
}
