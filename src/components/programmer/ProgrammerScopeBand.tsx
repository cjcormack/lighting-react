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
 * What the grid below is pointed at, and — in layer scope — what that layer asserts.
 *
 * Sits between the action bar and the workspace, which is where Session 1 left room for it. It is
 * a band rather than a control tucked into the toolbar because the scope changes what every cell
 * in the grid *means*: reading a value as "the rig" when it is really "one Look's stored row" is
 * the mistake this exists to make impossible.
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
  const sheets = useProgrammerSheets()
  const localCount = useLocalValueCount()
  const focusedTemplate = useFocusedTemplateLayer()

  if (!scope || !actions) return null

  // `lookName` rides on the layer frame, so naming the focused Look costs no second query — and
  // the stack this reads is the same broadcast the rail draws, so the two cannot disagree.
  const layer = scope.kind === 'layer' ? layers?.find((l) => l.layerId === scope.layerId) : undefined
  const mask = parsePropertyMask(layer?.propertyMask)

  return (
    <div className="@container flex flex-wrap items-center gap-2 border-b px-4 py-2 text-xs">
      <span className="text-muted-foreground">Showing</span>
      <ToggleGroup
        type="single"
        size="sm"
        value={scope.kind}
        onValueChange={(next) => {
          if (next === 'output') actions.setScope({ kind: 'output' })
          else if (next === 'local') actions.setScope({ kind: 'local' })
          // A click on the already-selected item clears the value; ignore it rather than
          // dropping the operator into a scope they didn't ask for.
        }}
      >
        <ToggleGroupItem value="output" aria-label="Show the composed output">
          <Eye className="size-3.5" />
          <span className="hidden @[520px]:inline">Output</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="local" aria-label="Show only the values you set">
          <Hand className="size-3.5" />
          <span className="hidden @[520px]:inline">Local</span>
        </ToggleGroupItem>
        {scope.kind === 'layer' && (
          <ToggleGroupItem value="layer" aria-label="Show the focused layer">
            <Layers className="size-3.5" />
            <span className="hidden @[520px]:inline">One layer</span>
          </ToggleGroupItem>
        )}
      </ToggleGroup>

      {scope.kind === 'output' && (
        <span className="text-muted-foreground">
          The cook — read-only. Click a tinted cell to jump to whatever won it.
        </span>
      )}
      {scope.kind === 'local' && (
        <>
          <span className="text-muted-foreground">
            {localCount === 0
              ? 'Only what you set. Nothing yet.'
              : `${localCount} value${localCount === 1 ? '' : 's'} — this is what Record will take.`}
          </span>
          {/* Here rather than on a stack row, because this is the one action whose subject is the
              scope you are looking at. Disabled rather than hidden with nothing to promote: it is
              how the gesture is discovered, and an affordance that only appears once you already
              know to busk first teaches nobody. */}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={localCount === 0}
            onClick={sheets.openMakeLayer}
            title={
              localCount === 0
                ? 'Set some values first, then promote them into a shared look'
                : 'Save these values as a look and apply it here as a layer'
            }
          >
            <Layers className="size-3.5" />
            Make layer
          </Button>
        </>
      )}
      {scope.kind === 'layer' && (
        <>
          <LookNameBadge
            name={layer?.source.name}
            missing={layers != null && layer == null}
            isTemplate={layer?.source.kind === 'TEMPLATE'}
            // From the provider rather than a query of this band's own: the grid and the notices
            // need the same answer, and asking three times would be three subscriptions to one list.
            isEffect={focusedTemplate?.kind === 'effect'}
          />
          <span className="text-muted-foreground">
            {mask.length === 0
              ? 'asserts every attribute'
              : `asserts ${mask.map((f) => FAMILY_LABELS[f].singular).join(' · ')}`}
          </span>
          <span className="text-muted-foreground">
            {layer && layer.targets.length > 0
              ? `${layer.targets.length} target${layer.targets.length === 1 ? '' : 's'}`
              : "the Look's own targets"}
          </span>
          {/* Said out loud, because an edit here is a live write that moves every cue layering this
              Look — and because it lands in steps rather than gliding, which an operator watching
              the stage deserves an explanation for. */}
          {saveState !== 'clean' && (
            <span
              className={saveState === 'error' ? 'text-destructive' : 'text-muted-foreground'}
              role="status"
            >
              {SAVE_LABELS[saveState]}
            </span>
          )}
        </>
      )}
    </div>
  )
}
