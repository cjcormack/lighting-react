import { Eye, Hand, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { LookNameBadge } from '@/components/looks/LookNameBadge'
import { FAMILY_LABELS, parsePropertyMask } from '@/lib/attributeFamily'
import { useProgrammerLayersQuery } from '@/store/programmer'
import { useLookSaveState } from './LookRowStore'
import { useFocusedTemplateLayer } from './FocusedTemplateLayer'
import { useProgrammerSheets } from './ProgrammerSheets'
import { useLocalValueCount } from './useLocalFamilyCounts'
import { useProgrammerScope, useProgrammerScopeActions } from './ProgrammerScope'
import type { LookSaveState } from './LookRowStore'

const SAVE_LABELS: Record<Exclude<LookSaveState, 'clean'>, string> = {
  dirty: 'Unsaved',
  saving: 'Saving…',
  error: 'Save failed — the look is unchanged on the desk',
}

/**
 * What the grid below is pointed at, and — in layer scope — what that layer asserts. **Row B's
 * left end.**
 *
 * It was a full-width band between the action bar and the workspace, one line of pills followed by
 * a sentence explaining them. Session 1 of the space plan moves it *inside* `ProgrammerGrid`'s
 * `renderToolbar` slot, above the filter, for two reasons: the scope is a fact about the grid and
 * not about the page, so it should span the grid column rather than reach across the rail; and its
 * line was one of six above the first fixture row on a page whose grid is the point.
 *
 * **The sentences are not deleted — they are the pills' `title`s**, and the layer arm's three
 * separate spans (`asserts …`, `n targets`, the save state) collapse into one muted line that
 * truncates. The `LookNameBadge` stays, and it is *in the third pill* now rather than beside the
 * group: the pill is what says "you are looking at one layer", and the layer's name is the answer
 * to which one.
 *
 * One line does go, and the plan records it as a cut: *"Click a tinted cell to jump to whatever
 * won it"* was the only place that gesture was taught, and a `title` on the Output pill is thinner
 * than a sentence on screen. If a desk pass shows nobody finds it, the answer is a first-visit
 * hint (`FU-PROG-OUTPUT-JUMP-HINT`), not the sentence back.
 *
 * The layer segment appears only while a layer is focused. Focusing happens in the rail, on the
 * stack row itself — a picker here would be a second way to say the same thing, and the stack is
 * the one that shows order, mask and amount alongside.
 */
export function ProgrammerScopeBand() {
  const scope = useProgrammerScope()
  const actions = useProgrammerScopeActions()
  const { data: layers } = useProgrammerLayersQuery()
  const saveState = useLookSaveState()
  const localCount = useLocalValueCount()
  const focusedTemplate = useFocusedTemplateLayer()

  if (!scope || !actions) return null

  // `lookName` rides on the layer frame, so naming the focused Look costs no second query — and
  // the stack this reads is the same broadcast the rail draws, so the two cannot disagree.
  const layer = scope.kind === 'layer' ? layers?.find((l) => l.layerId === scope.layerId) : undefined
  const mask = parsePropertyMask(layer?.propertyMask)

  // The two spans the band used to spend a line on, as one. Order is what the operator asks in
  // order: what does this layer assert, and onto what.
  //
  // **The save state is deliberately not in here.** It was, and that was a regression: this line
  // is hidden below `@[900px]`, which row B reaches on any ordinary desk once the rail and the
  // sidebar have taken their share — and a `display:none` element is out of the accessibility tree
  // too, so "Save failed" would have been neither shown nor announced, and its `title` could not be
  // hovered either. What a layer asserts is context you can go and look up; a failed write is the
  // one thing on this row that must never be a casualty of width.
  const layerDetail =
    scope.kind === 'layer'
      ? [
          mask.length === 0
            ? 'asserts every attribute'
            : `asserts ${mask.map((f) => FAMILY_LABELS[f].singular).join(' · ')}`,
          layer && layer.targets.length > 0
            ? `${layer.targets.length} target${layer.targets.length === 1 ? '' : 's'}`
            : "the Look's own targets",
        ].join(' · ')
      : null

  return (
    <div className="flex min-w-0 items-center gap-2 text-xs">
      <ToggleGroup
        type="single"
        size="sm"
        className="shrink-0"
        value={scope.kind}
        onValueChange={(next) => {
          if (next === 'output') actions.setScope({ kind: 'output' })
          else if (next === 'local') actions.setScope({ kind: 'local' })
          // A click on the already-selected item clears the value; ignore it rather than
          // dropping the operator into a scope they didn't ask for.
        }}
      >
        <ToggleGroupItem
          value="output"
          aria-label="Show the composed output"
          title="The cook — read-only. Click a tinted cell to jump to whatever won it."
          className="gap-1.5"
        >
          <Eye className="size-3.5" />
          <span className="hidden @[520px]:inline">Output</span>
        </ToggleGroupItem>
        <ToggleGroupItem
          value="local"
          aria-label="Show only the values you set"
          title={
            localCount === 0
              ? 'Only what you set. Nothing yet.'
              : `Only what you set — ${localCount} value${
                  localCount === 1 ? '' : 's'
                }, and this is what Record will take.`
          }
          className="gap-1.5"
        >
          <Hand className="size-3.5" />
          <span className="hidden @[520px]:inline">Local</span>
        </ToggleGroupItem>
        {scope.kind === 'layer' && (
          <ToggleGroupItem
            value="layer"
            aria-label="Show the focused layer"
            title="One layer's stored rows — not the rig"
            className="max-w-[220px] gap-1.5"
          >
            <LookNameBadge
              name={layer?.source.name}
              missing={layers != null && layer == null}
              isTemplate={layer?.source.kind === 'TEMPLATE'}
              // From the provider rather than a query of this band's own: the grid and the notices
              // need the same answer, and asking three times would be three subscriptions to one
              // list.
              isEffect={focusedTemplate?.kind === 'effect'}
              className="border-none bg-transparent px-0"
            />
          </ToggleGroupItem>
        )}
      </ToggleGroup>

      {layerDetail && (
        <span
          title={layerDetail}
          className="hidden min-w-0 truncate text-muted-foreground @[900px]:inline"
        >
          {layerDetail}
        </span>
      )}

      {/* Said out loud at **every** width, because an edit in this scope is a live write that moves
          every cue layering this Look — and because it lands in steps rather than gliding, which an
          operator watching the stage deserves an explanation for. It keeps its own element and its
          own `role="status"` precisely so no width query can take it away; see the note on
          `layerDetail` above for the regression that folding it into that line caused. */}
      {scope.kind === 'layer' && saveState !== 'clean' && (
        <span
          role="status"
          className={`shrink-0 truncate ${
            saveState === 'error' ? 'text-destructive' : 'text-muted-foreground'
          }`}
        >
          {SAVE_LABELS[saveState]}
        </span>
      )}
    </div>
  )
}

/**
 * Promote what you have busked into a named Look, applied here as a layer.
 *
 * A separate export rather than part of the band above, because it belongs at **row B's right
 * end** — past the filter, Lit, Groups and Columns — while the scope pills lead the row. It is
 * still the one action whose subject is the scope you are looking at, which is why it is on this
 * row at all rather than among the programmer's verbs; the plan moves it onto the rail's Local
 * values row in session 3, and it stays here until then.
 *
 * Disabled rather than hidden with nothing to promote: it is how the gesture is discovered, and an
 * affordance that only appears once you already know to busk first teaches nobody.
 */
export function MakeLayerButton() {
  const scope = useProgrammerScope()
  const sheets = useProgrammerSheets()
  const localCount = useLocalValueCount()

  if (scope?.kind !== 'local') return null

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 shrink-0"
      disabled={localCount === 0}
      onClick={sheets.openMakeLayer}
      title={
        localCount === 0
          ? 'Set some values first, then promote them into a shared look'
          : 'Save these values as a look and apply it here as a layer'
      }
    >
      <Layers className="size-3.5" />
      <span className="hidden @[800px]:inline">Make layer</span>
    </Button>
  )
}
