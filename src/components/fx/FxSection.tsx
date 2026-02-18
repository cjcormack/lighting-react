import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AudioWaveform, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import {
  useFixtureEffectsQuery,
  useRemoveFxMutation,
  usePauseFxMutation,
  useResumeFxMutation,
  type FixtureDirectEffect,
} from '@/store/fixtureFx'
import {
  useGroupActiveEffectsQuery,
  usePauseGroupFxMutation,
  useResumeGroupFxMutation,
  useRemoveGroupFxMutation,
} from '@/store/groups'
import { getElementModeLabel } from './fxConstants'
import type { Fixture } from '@/store/fixtures'
import type { GroupSummary, GroupActiveEffect } from '@/api/groupsApi'
import { ActiveEffectItem } from './ActiveEffectItem'
import { AddEditFxSheet, type FxTarget, type SheetMode } from './AddEditFxSheet'
import { PresetPicker } from './PresetPicker'

// ─── Public API ────────────────────────────────────────────────────────────

type FxSectionProps =
  | { fixture: Fixture; group?: never }
  | { group: GroupSummary; fixture?: never }

export function FxSection(props: FxSectionProps) {
  if ('fixture' in props && props.fixture) {
    return <FixtureFxSection fixture={props.fixture} />
  }
  if ('group' in props && props.group) {
    return <GroupFxSection group={props.group} />
  }
  return null
}

// ─── Fixture implementation ────────────────────────────────────────────────

function FixtureFxSection({ fixture }: { fixture: Fixture }) {
  const { data: effects, isLoading } = useFixtureEffectsQuery(fixture.key)
  const [isExpanded, setIsExpanded] = useState(false)
  const [sheetState, setSheetState] = useState<SheetMode | undefined>(undefined)

  const [removeFx] = useRemoveFxMutation()
  const [pauseFx] = usePauseFxMutation()
  const [resumeFx] = useResumeFxMutation()

  const directEffects = effects?.direct ?? []
  const indirectEffects = effects?.indirect ?? []
  const totalCount = directEffects.length + indirectEffects.length

  if (isLoading) return null

  return (
    <FxSectionShell
      totalCount={totalCount}
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded(!isExpanded)}
      onAdd={() => {
        if (!isExpanded) setIsExpanded(true)
        setSheetState({ mode: 'add' })
      }}
      presetPicker={
        <PresetPicker
          targetType="fixture"
          targetKey={fixture.key}
          compatiblePresetIds={fixture.compatiblePresetIds}
        />
      }
    >
      {directEffects.map((effect) => (
        <ActiveEffectItem
          key={effect.id}
          effectType={effect.effectType}
          propertyName={effect.propertyName}
          beatDivision={effect.beatDivision}
          blendMode={effect.blendMode}
          isRunning={effect.isRunning}
          distributionStrategy={effect.distributionStrategy ?? undefined}
          onPauseResume={() =>
            effect.isRunning
              ? pauseFx({ id: effect.id, fixtureKey: fixture.key })
              : resumeFx({ id: effect.id, fixtureKey: fixture.key })
          }
          onEdit={() =>
            setSheetState({ mode: 'edit', effectId: effect.id, effect })
          }
          onRemove={() => removeFx({ id: effect.id, fixtureKey: fixture.key })}
        />
      ))}

      {indirectEffects.map((effect) => (
        <ActiveEffectItem
          key={effect.id}
          effectType={effect.effectType}
          propertyName={effect.propertyName}
          beatDivision={effect.beatDivision}
          blendMode={effect.blendMode}
          isRunning={effect.isRunning}
          distributionStrategy={effect.distributionStrategy ?? undefined}
          badge={'groupName' in effect ? `via ${effect.groupName}` : undefined}
        />
      ))}

      <AddEditFxSheet
        target={{ type: 'fixture', fixture }}
        mode={sheetState}
        onClose={() => setSheetState(undefined)}
      />
    </FxSectionShell>
  )
}

// ─── Group implementation ──────────────────────────────────────────────────

function GroupFxSection({ group }: { group: GroupSummary }) {
  const { data: effects, isLoading } = useGroupActiveEffectsQuery(group.name)
  const [isExpanded, setIsExpanded] = useState(false)
  const [sheetState, setSheetState] = useState<SheetMode | undefined>(undefined)

  const [pauseFx] = usePauseGroupFxMutation()
  const [resumeFx] = useResumeGroupFxMutation()
  const [removeFx] = useRemoveGroupFxMutation()

  const totalCount = effects?.length ?? 0

  if (isLoading) return null

  return (
    <FxSectionShell
      totalCount={totalCount}
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded(!isExpanded)}
      onAdd={() => {
        if (!isExpanded) setIsExpanded(true)
        setSheetState({ mode: 'add' })
      }}
      presetPicker={
        <PresetPicker
          targetType="group"
          targetKey={group.name}
          compatiblePresetIds={group.compatiblePresetIds}
        />
      }
    >
      {effects?.map((effect) => (
        <ActiveEffectItem
          key={effect.id}
          effectType={effect.effectType}
          propertyName={effect.propertyName}
          beatDivision={effect.beatDivision}
          blendMode={effect.blendMode}
          isRunning={effect.isRunning}
          distributionStrategy={effect.distribution}
          badge={effect.elementMode ? getElementModeLabel(effect.elementMode) : undefined}
          onPauseResume={() =>
            effect.isRunning
              ? pauseFx({ id: effect.id, groupName: group.name })
              : resumeFx({ id: effect.id, groupName: group.name })
          }
          onEdit={() =>
            setSheetState({ mode: 'edit', effectId: effect.id, effect })
          }
          onRemove={() => removeFx({ id: effect.id, groupName: group.name })}
        />
      ))}

      <AddEditFxSheet
        target={{ type: 'group', group }}
        mode={sheetState}
        onClose={() => setSheetState(undefined)}
      />
    </FxSectionShell>
  )
}

// ─── Shared layout shell ───────────────────────────────────────────────────

interface FxSectionShellProps {
  totalCount: number
  isExpanded: boolean
  onToggle: () => void
  onAdd: () => void
  presetPicker?: React.ReactNode
  children: React.ReactNode
}

function FxSectionShell({ totalCount, isExpanded, onToggle, onAdd, presetPicker, children }: FxSectionShellProps) {
  return (
    <div className="pt-3 border-t">
      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-2 text-sm flex-1 min-w-0"
          onClick={onToggle}
        >
          <AudioWaveform className="size-4 text-muted-foreground shrink-0" />
          <h4 className="font-medium text-muted-foreground">Effects</h4>
          {totalCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {totalCount}
            </Badge>
          )}
          {isExpanded ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          {presetPicker}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={(e) => {
              e.stopPropagation()
              onAdd()
            }}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-2 space-y-2">
          {children}

          {totalCount === 0 && (
            <p className="text-xs text-muted-foreground">No effects active</p>
          )}
        </div>
      )}
    </div>
  )
}
