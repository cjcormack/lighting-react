import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react'
import { useLookListQuery } from '@/store/looks'
import { useGroupListQuery } from '@/store/groups'
import { useFixtureListQuery } from '@/store/fixtures'
import { CueTargetPicker } from '../CueTargetPicker'
import { TimingFields } from '../TimingEditor'
import { SpeedMasterSelect } from '@/components/fx/SpeedMasterSelect'
import { useSpeedMasterLiveQuery } from '@/store/speedMasters'
import { FAMILY_LABELS } from '@/lib/attributeFamily'
import type { CueLayer, CueTarget } from '@/api/cuesApi'
import type { LookSummary } from '@/api/looksApi'

interface TimingValues {
  delayMs?: number | null
  intervalMs?: number | null
  randomWindowMs?: number | null
}

interface LayerPickerProps {
  projectId: number
  onConfirm: (layer: CueLayer) => void
  onCancel: () => void
  /** Pre-selected target — the layer skips the target step and lands on this one. */
  preselectedTarget?: CueTarget | null
}

type Step = 'look' | 'targets' | 'timing'

/**
 * Build one cue layer: which Look, over which targets, with what timing.
 *
 * **Look first, then targets**, which is the reverse of the preset picker this replaces, and the
 * reason is the targeting mode. A deferred Look needs targets — it names none — so the target step
 * can usefully disable the heads it cannot drive. A *bound* Look already names its own, so the
 * target set becomes a filter rather than a requirement, and "all of them" has to be offerable.
 * Asking for targets first cannot express either.
 */
export function LayerPicker({
  projectId,
  onConfirm,
  onCancel,
  preselectedTarget,
}: LayerPickerProps) {
  const { data: looks } = useLookListQuery({ projectId })
  const { data: groups } = useGroupListQuery()
  const { data: fixtures } = useFixtureListQuery()
  const { data: liveMasters } = useSpeedMasterLiveQuery()

  const [step, setStep] = useState<Step>('look')
  const [look, setLook] = useState<LookSummary | null>(null)
  const [targets, setTargets] = useState<CueTarget[]>(
    preselectedTarget ? [preselectedTarget] : [],
  )
  const [timingValues, setTimingValues] = useState<TimingValues>({
    delayMs: null,
    intervalMs: null,
    randomWindowMs: null,
  })
  // Per-layer overrides. Null means "each of the Look's effects follows its own master" —
  // deliberately distinct from picking M1, which pins every effect in this layer to the global
  // master. When the operator opens the override, the state is seeded with a CONCRETE uuid
  // (master 1's) immediately: the select would otherwise *display* M1 without any onChange
  // firing, and confirming would silently save no override at all.
  const [speedMasterUuid, setSpeedMasterUuid] = useState<string | null>(null)
  // Independent of the speed override above, and seeded the same way for the same reason: a
  // wall-clock effect's rate master is a separate axis, so pinning one must not imply anything
  // about the other.
  const [rateSpeedMasterUuid, setRateSpeedMasterUuid] = useState<string | null>(null)

  const { bound, templates } = useMemo(() => {
    const all = looks ?? []
    return {
      bound: all.filter((l) => !l.hasDeferredRows),
      templates: all.filter((l) => l.hasDeferredRows),
    }
  }, [looks])

  /**
   * Targets the chosen Look cannot drive.
   *
   * Only meaningful for a **deferred** Look: `compatibleLookIds` is computed from
   * `editorFixtureType` and inferred capability, and the backend deliberately leaves bound Looks
   * out of it entirely — they name their own targets, so the question does not apply. Filtering a
   * bound Look by it would disable every head.
   */
  const disabledKeys = useMemo(() => {
    const disabled = new Map<string, string>()
    if (look == null || !look.hasDeferredRows) return disabled
    for (const group of groups ?? []) {
      if (!group.compatibleLookIds.includes(look.id)) {
        disabled.set(`group:${group.name}`, 'not compatible')
      }
    }
    for (const fixture of fixtures ?? []) {
      if (!fixture.compatibleLookIds.includes(look.id)) {
        disabled.set(`fixture:${fixture.key}`, 'not compatible')
      }
    }
    return disabled
  }, [look, groups, fixtures])

  const handleSelectLook = (next: LookSummary) => {
    setLook(next)
    // A preselected target means the operator came from that target's card and has already said
    // where this goes.
    setStep(preselectedTarget ? 'timing' : 'targets')
  }

  const handleSelectTarget = (target: CueTarget) => {
    setTargets([target])
    setStep('timing')
  }

  const useLooksOwnTargets = () => {
    setTargets([])
    setStep('timing')
  }

  const handleConfirm = () => {
    if (look == null) return
    onConfirm({
      lookId: look.id,
      targets,
      delayMs: timingValues.delayMs,
      intervalMs: timingValues.intervalMs,
      randomWindowMs: timingValues.randomWindowMs,
      speedMasterUuid,
      rateSpeedMasterUuid,
    })
  }

  return (
    <div className="flex flex-col h-full">
      {step === 'look' && (
        <>
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <button onClick={onCancel} className="hover:bg-accent rounded p-0.5 -ml-1">
              <ChevronLeft className="size-5" />
            </button>
            <div>
              <h3 className="font-medium text-sm">Choose a look</h3>
              <p className="text-xs text-muted-foreground">
                Layers compose in order — a later one wins over an earlier one.
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col gap-1 p-4 pt-0">
              {(looks?.length ?? 0) === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No looks in this project yet.
                </div>
              )}
              <LookGroup
                title="Recorded looks"
                hint="These name their own fixtures. Targets narrow them."
                looks={bound}
                onSelect={handleSelectLook}
              />
              <LookGroup
                title="Templates"
                hint="These take their fixtures from the layer."
                looks={templates}
                onSelect={handleSelectLook}
              />
            </div>
          </div>
        </>
      )}

      {step === 'targets' && look && (
        <>
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <button
              onClick={() => {
                setLook(null)
                setStep('look')
              }}
              className="hover:bg-accent rounded p-0.5 -ml-1"
            >
              <ChevronLeft className="size-5" />
            </button>
            <div>
              <h3 className="font-medium text-sm">{look.name}</h3>
              <p className="text-xs text-muted-foreground">
                {look.hasDeferredRows
                  ? 'Choose the fixture or group this look should land on.'
                  : 'Narrow this look to one fixture or group, or use the ones it already names.'}
              </p>
            </div>
          </div>

          {!look.hasDeferredRows && (
            <div className="px-4 pb-2">
              <Button variant="outline" size="sm" className="w-full" onClick={useLooksOwnTargets}>
                Use the look&rsquo;s own {look.targetCount} fixture
                {look.targetCount === 1 ? '' : 's'}
              </Button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            <CueTargetPicker onSelect={handleSelectTarget} disabledKeys={disabledKeys} />
          </div>
        </>
      )}

      {step === 'timing' && look && (
        <>
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <button
              onClick={() => setStep(preselectedTarget ? 'look' : 'targets')}
              className="hover:bg-accent rounded p-0.5 -ml-1"
            >
              <ChevronLeft className="size-5" />
            </button>
            <div>
              <h3 className="font-medium text-sm">{look.name}</h3>
              <p className="text-xs text-muted-foreground">
                {targets.length === 0
                  ? 'On the fixtures the look itself names.'
                  : `On ${targets.map((t) => t.key).join(', ')}.`}
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
            <TimingFields values={timingValues} onChange={setTimingValues} />

            {/* Per-layer speed master. Opt-in: unset means every effect in the look follows its
                own master, and most layers want exactly that. Opening seeds master 1's concrete
                uuid so what the select shows is what gets saved — confirm-without-touching must
                not silently drop the pin. */}
            {speedMasterUuid == null ? (
              <button
                type="button"
                disabled={!liveMasters?.length}
                onClick={() => {
                  const master1 = liveMasters?.find((m) => m.index === 1)
                  if (master1?.uuid) setSpeedMasterUuid(master1.uuid)
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                + Override speed master for this layer
              </button>
            ) : (
              <div className="space-y-1.5">
                <SpeedMasterSelect value={speedMasterUuid} onChange={setSpeedMasterUuid} />
                <button
                  type="button"
                  onClick={() => setSpeedMasterUuid(null)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Remove override — each effect follows its own master
                </button>
              </div>
            )}

            {/* Wall-clock rate master, same opt-in shape. Separate control because the two apply
                to different effects: a look can hold both beat and wall-clock effects, and pinning
                one axis says nothing about the other. */}
            {rateSpeedMasterUuid == null ? (
              <button
                type="button"
                disabled={!liveMasters?.length}
                onClick={() => {
                  const master1 = liveMasters?.find((m) => m.index === 1)
                  if (master1?.uuid) setRateSpeedMasterUuid(master1.uuid)
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                + Override rate master for this layer
              </button>
            ) : (
              <div className="space-y-1.5">
                <SpeedMasterSelect
                  value={rateSpeedMasterUuid}
                  onChange={setRateSpeedMasterUuid}
                  label="Rate master"
                  description="Only wall-clock effects in this look are affected."
                />
                <button
                  type="button"
                  onClick={() => setRateSpeedMasterUuid(null)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Remove override — each effect follows its own rate master
                </button>
              </div>
            )}
          </div>

          <div className="border-t p-4 flex items-center gap-2">
            <div className="flex-1" />
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleConfirm}>Add layer</Button>
          </div>
        </>
      )}
    </div>
  )
}

function LookGroup({
  title,
  hint,
  looks,
  onSelect,
}: {
  title: string
  hint: string
  looks: LookSummary[]
  onSelect: (look: LookSummary) => void
}) {
  if (looks.length === 0) return null
  return (
    <div className="space-y-1">
      <div className="pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      {looks.map((look) => (
        <button
          key={look.id}
          onClick={() => onSelect(look)}
          className="flex items-center gap-2 p-3 rounded-md border text-left hover:bg-accent/50 transition-colors"
        >
          <Layers className="size-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{look.name}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {look.families.map((family) => (
                <Badge key={family} variant="outline" className="px-1.5 py-0 text-[10px]">
                  {FAMILY_LABELS[family].singular}
                </Badge>
              ))}
              <span className="text-[10px] text-muted-foreground">
                {look.rowCount} row{look.rowCount === 1 ? '' : 's'}
                {look.effectCount > 0 &&
                  ` · ${look.effectCount} effect${look.effectCount === 1 ? '' : 's'}`}
              </span>
            </div>
          </div>
          <ChevronRight className="size-4 text-muted-foreground shrink-0" />
        </button>
      ))}
    </div>
  )
}
