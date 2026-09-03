import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useCurrentProjectQuery } from '@/store/projects'
import { useLookListQuery } from '@/store/looks'
import { useTemplateListQuery, useToggleTemplateMutation } from '@/store/templates'
import { FAMILY_LABELS, type AttributeFamily } from '@/lib/attributeFamily'
import { formatError } from '@/lib/formatError'
import { templateLayerPresence } from './lookPresence'
import {
  describeLookContents,
  templateSwatch,
  BuskPools,
  EffectPadDetail,
  type PadItem,
} from './BuskPools'
import { TargetList } from './TargetList'
import { TargetBand } from './TargetBand'
import { BuskSpeedRail } from './BuskSpeedRail'
import { BuskCueStacks } from './BuskCueStacks'
import { useBuskingState } from './useBuskingState'
import { type BuskingTarget } from './buskingTypes'
import type { ShowTransport } from '@/hooks/useShowTransport'

interface BuskingViewProps {
  projectId: number
  transport: ShowTransport
}

/**
 * The busk view's body: the target band, the pad pools, the cue column and the speed rail.
 *
 * The show chrome above it (`ShowHeader`, `ShowBar`) belongs to `routes/Busk.tsx`, like every other
 * live view — this component owns only what is particular to busking.
 *
 * The transport arrives as a prop rather than being mounted here, because `routes/Busk.tsx` already
 * holds one through `useShowBarProps`. A second `useShowTransport` on the page would run a second
 * rAF loop and a second reconcile effect writing the same runner slice — the defect adopting that
 * hook removed from the Prompt Book, which is worth not reintroducing one view along.
 *
 * **Nothing here reads a target's running effects.** It used to: eight fixed hook slots fanned the
 * selection out over `useGroupActiveEffectsQuery` / `useFixtureEffectsQuery` so the effect pads could
 * read their rings from the FX list — which also capped the selection at eight targets
 * (`FU-BUSK-TARGET-CAP`). Both surviving pad kinds read the programmer's **layer stack** instead, and
 * that needs only the targets, so the fan-out and its cap went with the effect pads.
 */
export function BuskingView({ projectId, transport }: BuskingViewProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [targetSheetOpen, setTargetSheetOpen] = useState(false)

  const {
    selectedTargets,
    selectedArray,
    selectedLayerTargets,
    selectTarget,
    toggleTarget,
    clearSelection,
    programmerLayers,
    applyLook,
    computeLookPresence,
  } = useBuskingState()

  const { data: currentProject } = useCurrentProjectQuery()
  const { data: looks } = useLookListQuery(
    { projectId: currentProject?.id ?? 0 },
    { skip: !currentProject },
  )
  const { data: templates } = useTemplateListQuery(
    { projectId: currentProject?.id ?? 0 },
    { skip: !currentProject },
  )
  const [toggleTemplate] = useToggleTemplateMutation()
  const navigate = useNavigate()

  const openTargetPicker = useCallback(() => setTargetSheetOpen(true), [])

  // On mobile, close the target sheet when a target is selected
  const handleSelectTarget = useCallback(
    (target: BuskingTarget) => {
      selectTarget(target)
      if (!isDesktop) {
        setTargetSheetOpen(false)
      }
    },
    [selectTarget, isDesktop],
  )

  /**
   * What the selection can actually take, in capability terms: the union over the selected targets.
   *
   * The **only** filter left. There used to be a second one on `editorFixtureType` — a Look was
   * refused unless it had been authored against one of the selected fixtures' types — and that gate
   * is precisely what made "Amber Key" a MAC Aura's colour rather than a colour (D6). It went with
   * the column.
   */
  const targetCapabilities = useMemo(() => {
    const caps = new Set<string>()
    for (const target of selectedArray) {
      if (target.type === 'group') target.group.capabilities.forEach((c) => caps.add(c))
      else target.fixture.capabilities.forEach((c) => caps.add(c))
    }
    return caps
  }, [selectedArray])

  /**
   * The pads: Looks with **deferred effects**, plus every template.
   *
   * Both belong here and for the same reason — a pad puts a named thing on whatever is selected, so
   * the thing has to be one that takes its targets from the press. For a Look that means a deferred
   * *effect* (a chase you point somewhere); its bound rows name their own heads and reach the stage
   * through a cue layer or Include instead. A template is target-less by definition, which is what
   * made a palette bank a pad grid in the first place.
   */
  const padItems = useMemo<PadItem[]>(() => {
    /**
     * Does every family this thing touches have a capability the selection can answer?
     *
     * BEAM is deliberately unfiltered: a gobo wheel and a zoom are separate channels with no single
     * capability flag, and the backend skips a property a fixture lacks. Nothing to filter on.
     */
    const familiesFit = (families: readonly AttributeFamily[]) => {
      if (selectedArray.length === 0) return true
      return families.every((family) => {
        if (family === 'INTENSITY') return targetCapabilities.has('dimmer')
        if (family === 'COLOUR') return targetCapabilities.has('colour')
        if (family === 'POSITION') return targetCapabilities.has('position')
        return true
      })
    }

    const lookPads: PadItem[] = (looks ?? [])
      .filter((look) => look.hasDeferredEffects)
      .filter((look) => familiesFit(look.families))
      .map((look) => ({
        key: `look-${look.id}`,
        name: look.name,
        notes: look.notes,
        detail: describeLookContents(look),
        kind: 'look' as const,
        // A Look spans families by nature — `families` is derived from its rows and can hold two —
        // so it has no column and gets a section of its own instead.
        family: null,
        swatch: null,
        presence: computeLookPresence(look),
        onToggle: () => void applyLook(look),
        onEdit: () => navigate(`/projects/${currentProject?.id ?? 0}/looks`),
      }))

    const templatePads: PadItem[] = (templates ?? [])
      .filter((t) => t.family == null || familiesFit([t.family]))
      .map((template) => ({
        key: `template-${template.id}`,
        name: template.name,
        notes: template.notes,
        detail:
          template.kind === 'effect' ? (
            <EffectPadDetail template={template} />
          ) : template.isGeneric ? (
            template.family != null ? (
              FAMILY_LABELS[template.family].singular
            ) : (
              'value'
            )
          ) : (
            `${template.rows.length} heads`
          ),
        kind: 'template' as const,
        isEffect: template.kind === 'effect',
        family: template.family,
        swatch: templateSwatch(template),
        // A template's pad can only light from the **layer stack**, and that is more load-bearing
        // now that one can hold an effect rather than less: an effect-template pad's ring would look
        // matchable against the running instance, and matching there would light for effect
        // templates while leaving every value template's pad dark. `templateLayerPresence` asks
        // whether a layer applying this template covers the selection, which is the same question
        // one press ago.
        presence: templateLayerPresence(programmerLayers ?? [], selectedLayerTargets, template.id),
        onToggle: () => {
          // Guarded the same way `applyLook` is, and for the same reason: a toggle carrying no
          // targets is not "apply to nothing", it is a layer the server has to interpret. The
          // pool is dimmed and its buttons made inert with an empty selection, so this should be
          // unreachable — but the two pad kinds must not disagree about what an empty press means.
          if (currentProject == null || selectedLayerTargets.length === 0) return
          void toggleTemplate({
            projectId: currentProject.id,
            templateId: template.id,
            targets: selectedLayerTargets,
            propertyMask: template.family ?? undefined,
          })
            .unwrap()
            .catch((err) => toast.error(formatError(err)))
        },
        onEdit: () => navigate(`/projects/${currentProject?.id ?? 0}/templates`),
      }))

    return [...templatePads, ...lookPads]
  }, [
    looks,
    templates,
    targetCapabilities,
    selectedArray.length,
    computeLookPresence,
    applyLook,
    navigate,
    currentProject,
    programmerLayers,
    selectedLayerTargets,
    toggleTemplate,
  ])

  return (
    <div className="flex h-full flex-col">
      {/* The band lives *inside* the left column, so the rail's border runs from under the ShowBar
          to the bottom of the page — the mock's arrangement, and the one that gives a rail which
          scrolls its own bank the full height to do it in.

          One layout at every width. The old three-way branch existed because the target list was a
          sidebar, which a phone has no room for; a band of pads scrolling sideways fits both, so
          the narrow arm is now the same page with the rail hidden and the sheet as a second way in. */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TargetBand
            selectedTargets={selectedTargets}
            onToggle={toggleTarget}
            onClear={clearSelection}
            onOpenPicker={openTargetPicker}
          />
          <div className="min-h-0 flex-1">
            <BuskPools
              hasSelection={selectedArray.length > 0}
              padItems={padItems}
              cueColumn={<BuskCueStacks projectId={projectId} transport={transport} />}
              currentProjectId={currentProject?.id}
            />
          </div>
        </div>
        {/* Hides itself below `md`; the ShowBar's own masters chip covers that width. */}
        <BuskSpeedRail />
      </div>

      {/* Kept for narrow widths, where the band is reachable but a long rig means a lot of
          sideways scrolling. Selecting here *replaces* the selection and closes — picking one
          thing and getting one thing is what a modal picker should do. */}
      <Sheet open={targetSheetOpen} onOpenChange={setTargetSheetOpen}>
        <SheetContent side="bottom" className="h-[70vh]">
          <SheetHeader>
            <SheetTitle>Select Targets</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <TargetList
              selectedTargets={selectedTargets}
              onSelect={handleSelectTarget}
              onToggle={toggleTarget}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
