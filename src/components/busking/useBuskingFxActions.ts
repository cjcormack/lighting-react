import { useCallback } from 'react'
import { useAddFixtureFxMutation, useRemoveFxMutation } from '@/store/fixtureFx'
import { useApplyGroupFxMutation, useRemoveGroupFxMutation } from '@/store/groups'
import { useFixtureListQuery } from '@/store/fixtures'
import { useCurrentProjectQuery } from '@/store/projects'
import { useToggleLookMutation } from '@/store/looks'
import { ignoreReportedError } from '@/store/errorToastMiddleware'
import { programmerClearEntry, programmerSet } from '@/store/programmer'
import { serializeLevel } from '@/lib/programmerValue'
import { resolveEffectProperty } from '@/lib/fxTargetProperties'
import { fxCreateAddition, type FxCreateRequest } from '@/lib/fxCreateRequest'
import type { EffectLibraryEntry } from '@/store/fixtureFx'
import type { BlendMode, DistributionStrategy, ElementMode } from '@/api/groupsApi'
import type { LookSummary, ToggleLookTarget } from '@/api/looksApi'
import {
  fxPropertyTarget,
  hasEffect,
  lookLayerTarget,
  normalizeEffectName,
  programmerTarget,
  type EffectPresence,
  type PropertyButton,
  type TargetEffectsData,
} from './buskingTypes'

interface BuskingDefaults {
  /** Beat division a one-tap apply uses. */
  defaultBeatDivision: number
  /** Pad-wide default speed master (uuid; null → master 1). */
  defaultSpeedMasterUuid: string | null
}

/**
 * The four things a pad tap can do: run an effect, run a configured effect, hold a property value,
 * and toggle a Look.
 *
 * The first two share `fxCreateAddition` with the add/edit sheet; the third does not go near the FX
 * routes at all (see `togglePropertyEffect`), and the fourth is one Look toggle the server fans out.
 */
export function useBuskingFxActions({
  defaultBeatDivision,
  defaultSpeedMasterUuid,
}: BuskingDefaults) {
  const { data: fixtureList } = useFixtureListQuery()
  const { data: currentProject } = useCurrentProjectQuery()

  const [addFixtureFx] = useAddFixtureFxMutation()
  const [removeFx] = useRemoveFxMutation()
  const [applyGroupFx] = useApplyGroupFxMutation()
  const [removeGroupFx] = useRemoveGroupFxMutation()
  const [toggleLookMutation] = useToggleLookMutation()

  /** Create one effect on one target, whichever route that target needs. */
  const addEffect = useCallback(
    (
      data: TargetEffectsData,
      effect: EffectLibraryEntry,
      request: Omit<FxCreateRequest, 'effectType' | 'propertyName'>,
    ): Promise<unknown> | null => {
      const propertyName = resolveEffectProperty(
        fxPropertyTarget(data.target, fixtureList),
        effect,
      )
      if (!propertyName) return null

      // Everything the pad creates belongs to the programmer's reserved band, so Clear sweeps it
      // with the rest of the busk.
      const addition = fxCreateAddition(
        data.target.type === 'group'
          ? { type: 'group', groupName: data.target.name }
          : { type: 'fixture', fixtureKey: data.target.key },
        { ...request, effectType: effect.name, propertyName, programmerOwned: true },
      )
      return addition.kind === 'group'
        ? applyGroupFx({ groupName: addition.groupName, ...addition.payload }).unwrap()
        : addFixtureFx(addition.payload).unwrap()
    },
    [fixtureList, applyGroupFx, addFixtureFx],
  )

  /** One tap on an effect pad: run it on every selected target, or stop it on all of them. */
  const toggleEffect = useCallback(
    async (
      effect: EffectLibraryEntry,
      presence: EffectPresence,
      targetEffectsData: TargetEffectsData[],
    ) => {
      const normalized = normalizeEffectName(effect.name)

      if (presence === 'all') {
        const removals: Promise<unknown>[] = []
        for (const data of targetEffectsData) {
          if (data.target.type === 'group') {
            for (const fx of data.groupEffects ?? []) {
              if (normalizeEffectName(fx.effectType) === normalized) {
                removals.push(removeGroupFx({ id: fx.id, groupName: data.target.name }).unwrap())
              }
            }
          } else {
            for (const fx of data.fixtureDirectEffects ?? []) {
              if (normalizeEffectName(fx.effectType) === normalized) {
                removals.push(removeFx({ id: fx.id, fixtureKey: data.target.key }).unwrap())
              }
            }
          }
        }
        await Promise.all(removals).catch(ignoreReportedError)
        return
      }

      const defaults: Record<string, string> = {}
      effect.parameters.forEach((p) => {
        defaults[p.name] = p.defaultValue
      })

      const additions = targetEffectsData
        .filter((data) => !hasEffect(data, normalized))
        .map((data) =>
          addEffect(data, effect, {
            beatDivision: defaultBeatDivision,
            blendMode: 'OVERRIDE' as BlendMode,
            phaseOffset: 0,
            parameters: defaults,
            speedMasterUuid: defaultSpeedMasterUuid,
          }),
        )
        .filter((p): p is Promise<unknown> => p !== null)

      await Promise.all(additions).catch(ignoreReportedError)
    },
    [defaultBeatDivision, defaultSpeedMasterUuid, addEffect, removeFx, removeGroupFx],
  )

  /** The configure sheet's apply: the same create, with the operator's own settings. */
  const applyEffectWithParams = useCallback(
    async (
      effect: EffectLibraryEntry,
      targetEffectsData: TargetEffectsData[],
      params: {
        beatDivision: number
        blendMode: string
        phaseOffset: number
        distribution: string
        elementMode?: string
        stepTiming?: boolean
        parameters: Record<string, string>
        speedMasterUuid?: string
        rateSpeedMasterUuid?: string
      },
    ) => {
      const additions = targetEffectsData
        .map((data) =>
          addEffect(data, effect, {
            beatDivision: params.beatDivision,
            blendMode: params.blendMode as BlendMode,
            phaseOffset: params.phaseOffset,
            parameters: params.parameters,
            distribution: params.distribution as DistributionStrategy,
            elementMode: params.elementMode as ElementMode | undefined,
            stepTiming: params.stepTiming,
            speedMasterUuid: params.speedMasterUuid,
            rateSpeedMasterUuid: params.rateSpeedMasterUuid,
          }),
        )
        .filter((p): p is Promise<unknown> => p !== null)

      await Promise.all(additions).catch(ignoreReportedError)
    },
    [addEffect],
  )

  /**
   * Toggle or set a property value on every selected target.
   *
   * Writes go straight to the programmer: on for a plain set, `clearEntry` to release. The
   * release is a full clear of the property (every owner), which is what the operator means
   * by tapping the pad off — a busked value sitting under a locate should go too.
   */
  const togglePropertyEffect = useCallback(
    async (
      button: PropertyButton,
      presence: EffectPresence,
      targetEffectsData: TargetEffectsData[],
      settingLevel?: number,
    ) => {
      // A tap with no explicit level on an already-set pad means "turn it off".
      if (presence === 'all' && settingLevel === undefined) {
        for (const data of targetEffectsData) {
          const { targetType, targetKey } = programmerTarget(data.target)
          programmerClearEntry(targetType, targetKey, button.propertyName)
        }
        return
      }

      const level =
        settingLevel !== undefined ? settingLevel : button.kind === 'slider' ? 128 : 0
      for (const data of targetEffectsData) {
        const { targetType, targetKey } = programmerTarget(data.target)
        programmerSet(targetType, targetKey, button.propertyName, serializeLevel(level))
      }
    },
    [],
  )

  const applyLook = useCallback(
    async (look: LookSummary, _presence: EffectPresence, targetEffectsData: TargetEffectsData[]) => {
      const projectId = currentProject?.id
      if (!projectId || targetEffectsData.length === 0) return

      const targets: ToggleLookTarget[] = targetEffectsData.map((data) =>
        lookLayerTarget(data.target),
      )

      await toggleLookMutation({
        projectId,
        lookId: look.id,
        targets,
      })
        .unwrap()
        .catch(ignoreReportedError)
    },
    [currentProject?.id, toggleLookMutation],
  )

  return { toggleEffect, applyEffectWithParams, togglePropertyEffect, applyLook }
}
