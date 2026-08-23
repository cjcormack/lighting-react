import { useCallback, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { LayerRow, LookStack, type LayerHandlers } from '@/components/looks/LookStack'
import { AddLayerSheet } from '@/components/cues/editor/AddLayerSheet'
import { useLookListQuery } from '@/store/looks'
import {
  programmerAddLayer,
  programmerMoveLayer,
  programmerPatchLayer,
  programmerRemoveLayer,
  useProgrammerLayersQuery,
} from '@/store/programmer'
import type { CueLayer } from '@/api/cuesApi'
import type { ProgrammerLayer } from '@/store/programmer'

/**
 * The programmer's Look stack — the same `LookStack` the cue editor draws, over the live
 * programmer instead of a saved cue.
 *
 * That is the whole point of §3.6 of the composition plan rather than a saving: the programmer *is*
 * an unsaved cue, so Record is "save this stack", Include is "load that one" and a layer list that
 * looked different here would be describing one structure twice.
 *
 * Every mutation is a fire-and-forget WS op answered with the whole `programmer.layerState`
 * broadcast, so there is no optimistic update here and none is wanted: the stack is shared between
 * tabs and surfaces, and the server's ordering is the only one that composes.
 */
export function ProgrammerLookStack() {
  const { projectId: projectIdParam } = useParams()
  const projectId = Number(projectIdParam)
  const { data: allLayers } = useProgrammerLayersQuery()
  const { data: lookList } = useLookListQuery({ projectId }, { skip: !projectId })
  const [addOpen, setAddOpen] = useState(false)

  const looksById = useMemo(
    () => new Map((lookList ?? []).map((look) => [look.id, look])),
    [lookList],
  )
  const looksLoaded = lookList != null

  // The Look editor's live preview is a layer too, but it is not part of the composition an
  // operator authors: it holds an unsaved draft, it is never recorded, and the server pins it to
  // the tail whatever index a move asks for. Rendering it in the sortable list would offer three
  // controls that all lie.
  const layers = useMemo(() => (allLayers ?? []).filter((l) => !l.isPreview), [allLayers])
  const preview = useMemo(() => (allLayers ?? []).find((l) => l.isPreview), [allLayers])

  // A stable identity, because `LookStack` memoises its dnd-kit id list on it: an inline arrow
  // would mint a fresh `items` array for `SortableContext` on every render of the pane.
  const keyFor = useCallback((layer: ProgrammerLayer) => `layer-${layer.layerId}`, [])

  const handlers: LayerHandlers = useMemo(
    () => ({
      // Index → `layerId` is this component's job, not `LookStack`'s: the list it renders is
      // filtered, so only the caller knows what position N means.
      onRemove: (index) => {
        const layer = layers[index]
        if (layer) programmerRemoveLayer(layer.layerId)
      },
      onMove: (oldIndex, newIndex) => {
        const layer = layers[oldIndex]
        // No client-side renumbering (the cue path's `reorderCueLayers`): the server renumbers the
        // whole stack and re-ranks the running effects in place, and restating `sortOrder` here
        // would be a second opinion on an order we don't own.
        if (layer) programmerMoveLayer(layer.layerId, newIndex)
      },
      onSetEnabled: (index, enabled) => {
        const layer = layers[index]
        if (layer) programmerPatchLayer(layer.layerId, { enabled })
      },
      onSetAmount: (index, amount) => {
        const layer = layers[index]
        if (layer) programmerPatchLayer(layer.layerId, { amount })
      },
      onSetBlendMode: (index, blendMode) => {
        const layer = layers[index]
        if (layer) programmerPatchLayer(layer.layerId, { blendMode })
      },
      onSetPropertyMask: (index, propertyMask) => {
        const layer = layers[index]
        // `propertyMask` is `string | undefined` on the patch, and an omitted field means "leave
        // alone" — so a null (unmasked) has to travel as the empty string, which the server reads
        // as "no mask". Sending `undefined` would make clearing a mask a silent no-op.
        if (layer) programmerPatchLayer(layer.layerId, { propertyMask: propertyMask ?? '' })
      },
      onSetStomp: (index, stomp) => {
        const layer = layers[index]
        if (layer) programmerPatchLayer(layer.layerId, { stomp })
      },
    }),
    [layers],
  )

  const handleAdd = useCallback((layer: CueLayer) => {
    // The picker's timing fields are dropped rather than sent: a programmer layer fires now, and
    // "in 3 seconds" is a property of a cue's playback, which the programmer has none of. The
    // picker is told so via `allowTiming={false}`, so they are not offered either — a field the
    // operator can fill in and this call then ignores is worse than no field.
    programmerAddLayer({
      lookId: layer.lookId,
      targets: layer.targets,
      speedMasterUuid: layer.speedMasterUuid ?? undefined,
      rateSpeedMasterUuid: layer.rateSpeedMasterUuid ?? undefined,
    })
    setAddOpen(false)
  }, [])

  return (
    <div className="space-y-3 py-2">
      <LookStack
        layers={layers}
        looksById={looksById}
        looksLoaded={looksLoaded}
        handlers={handlers}
        onAdd={() => setAddOpen(true)}
        emptyNote="No layers. Add one to put a look on the rig, or tap a busking pad."
        precedenceNote={
          <>
            Later layers win, and the values you set yourself win over all of them &mdash; for every
            attribute, intensity included. Across cues, HTP still governs intensity. Record writes
            this stack into a cue as its layers.
          </>
        }
        keyFor={keyFor}
        footer={
          preview && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  Preview
                </Badge>
                An unsaved look is being previewed on top of the stack. It closes with the editor and
                is never recorded.
              </p>
              <LayerRow
                layer={preview}
                index={layers.length}
                look={looksById.get(preview.lookId)}
                looksLoaded={looksLoaded}
                handlers={handlers}
                sortable={false}
                showTargets
                readOnly
              />
            </div>
          )
        }
      />

      <AddLayerSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={projectId}
        defaultTarget={null}
        allowTiming={false}
        onAdd={handleAdd}
      />
    </div>
  )
}
