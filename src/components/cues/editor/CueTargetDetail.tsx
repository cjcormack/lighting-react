import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  AudioWaveform,
  Bookmark,
  Loader2,
  Plus,
  Sliders,
  X,
} from 'lucide-react'
import { useFixtureListQuery } from '@/store/fixtures'
import { useGroupPropertiesQuery } from '@/store/groups'
import { FixtureContent } from '@/components/fixtures/FixtureContent'
import { GroupPropertiesSection } from '@/components/groups/GroupCard'
import { EffectFlow } from './EffectFlow'
import { PresetPicker } from './PresetPicker'
import { EffectSummary } from '@/components/fx/EffectSummary'
import { PresetApplicationSummary } from '@/components/fx/PresetApplicationSummary'
import {
  fromPresetEffect,
  fromCueAdHocEffect,
} from '@/components/fx/effectSummaryTypes'
import { useEffectLibraryQuery } from '@/store/fixtureFx'
import { useProjectPresetListQuery } from '@/store/fxPresets'
import { TimingBadge } from '../TimingBadge'
import type { Cue, CueAdHocEffect } from '@/api/cuesApi'
import type { TargetSelection } from './CueTargetGrid'

export interface CueTargetDetailProps {
  selection: TargetSelection
  projectId: number

  presetApps: Cue['presetApplications']
  adHocEffects: CueAdHocEffect[]
  palette: string[]

  onAddPreset: (app: {
    presetId: number
    presetName: string
    targets: { type: 'group' | 'fixture'; key: string }[]
    delayMs?: number | null
    intervalMs?: number | null
    randomWindowMs?: number | null
  }) => void
  onRemovePreset: (index: number) => void

  onAddEffect: (effect: CueAdHocEffect) => void
  onUpdateEffect: (index: number, effect: CueAdHocEffect) => void
  onRemoveEffect: (index: number) => void
}

type DetailTab = 'properties' | 'effects' | 'presets'

/** Detail pane for the selected target. Properties/Effects/Presets tabs. */
export function CueTargetDetail({
  selection,
  projectId,
  presetApps,
  adHocEffects,
  palette,
  onAddPreset,
  onRemovePreset,
  onAddEffect,
  onUpdateEffect,
  onRemoveEffect,
}: CueTargetDetailProps) {
  const [tab, setTab] = useState<DetailTab>('properties')
  const [editingEffectIndex, setEditingEffectIndex] = useState<number | null>(null)
  const [addingEffect, setAddingEffect] = useState(false)
  const [editingPresetIndex, setEditingPresetIndex] = useState<number | null>(null)
  const [addingPreset, setAddingPreset] = useState(false)

  const { data: library } = useEffectLibraryQuery()
  const { data: presets } = useProjectPresetListQuery(projectId)

  const relevantPresetApps = useMemo(
    () =>
      presetApps
        .map((pa, index) => ({ pa, index }))
        .filter(({ pa }) =>
          pa.targets.some(
            (t) => t.type === selection.type && t.key === selection.key,
          ),
        ),
    [presetApps, selection.type, selection.key],
  )

  const relevantAdHocEffects = useMemo(
    () =>
      adHocEffects
        .map((eff, index) => ({ eff, index }))
        .filter(
          ({ eff }) =>
            eff.targetType === selection.type && eff.targetKey === selection.key,
        ),
    [adHocEffects, selection.type, selection.key],
  )

  return (
    <div className="border-t mt-4 pt-3 space-y-3">
      <Tabs value={tab} onValueChange={(v) => setTab(v as DetailTab)}>
        <TabsList>
          <TabsTrigger value="properties">
            <Sliders className="size-3.5 mr-1.5" />
            Properties
          </TabsTrigger>
          <TabsTrigger value="effects">
            <AudioWaveform className="size-3.5 mr-1.5" />
            Effects
            {relevantAdHocEffects.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                {relevantAdHocEffects.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="presets">
            <Bookmark className="size-3.5 mr-1.5" />
            Presets
            {relevantPresetApps.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                {relevantPresetApps.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="properties" className="pt-3">
          {selection.type === 'fixture' ? (
            <FixtureDetailPane fixtureKey={selection.key} />
          ) : (
            <GroupDetailPane groupName={selection.key} />
          )}
        </TabsContent>

        <TabsContent value="effects" className="pt-3 space-y-2">
          {addingEffect || editingEffectIndex !== null ? (
            <EffectFlow
              onConfirm={(effects) => {
                for (const eff of effects) onAddEffect(eff)
                setAddingEffect(false)
              }}
              onCancel={() => {
                setAddingEffect(false)
                setEditingEffectIndex(null)
              }}
              existingEffect={
                editingEffectIndex !== null ? adHocEffects[editingEffectIndex] : null
              }
              onUpdate={(updated) => {
                if (editingEffectIndex !== null) onUpdateEffect(editingEffectIndex, updated)
                setEditingEffectIndex(null)
              }}
              onRemove={() => {
                if (editingEffectIndex !== null) onRemoveEffect(editingEffectIndex)
                setEditingEffectIndex(null)
              }}
              palette={palette}
            />
          ) : (
            <>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setAddingEffect(true)}>
                  <Plus className="size-3" /> Add Effect
                </Button>
              </div>
              {relevantAdHocEffects.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  No ad-hoc effects targeting this {selection.type}.
                </p>
              )}
              {relevantAdHocEffects.map(({ eff, index }) => (
                <EffectSummary
                  key={`effect-${index}`}
                  effect={fromCueAdHocEffect(eff, library)}
                  target={{ type: eff.targetType, key: eff.targetKey }}
                  palette={palette}
                  onClick={() => setEditingEffectIndex(index)}
                  actions={
                    <>
                      <TimingBadge
                        delayMs={eff.delayMs}
                        intervalMs={eff.intervalMs}
                        randomWindowMs={eff.randomWindowMs}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemoveEffect(index)
                        }}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </>
                  }
                />
              ))}
            </>
          )}
        </TabsContent>

        <TabsContent value="presets" className="pt-3 space-y-2">
          {addingPreset || editingPresetIndex !== null ? (
            <PresetPicker
              projectId={projectId}
              onConfirm={(app) => {
                onAddPreset(app)
                setAddingPreset(false)
                setEditingPresetIndex(null)
              }}
              onCancel={() => {
                setAddingPreset(false)
                setEditingPresetIndex(null)
              }}
              existingPresetId={
                editingPresetIndex !== null ? presetApps[editingPresetIndex]?.presetId : undefined
              }
              existingTargets={
                editingPresetIndex !== null ? presetApps[editingPresetIndex]?.targets : undefined
              }
              existingTiming={
                editingPresetIndex !== null
                  ? {
                      delayMs: presetApps[editingPresetIndex]?.delayMs,
                      intervalMs: presetApps[editingPresetIndex]?.intervalMs,
                      randomWindowMs: presetApps[editingPresetIndex]?.randomWindowMs,
                    }
                  : undefined
              }
            />
          ) : (
            <>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setAddingPreset(true)}>
                  <Plus className="size-3" /> Add Preset
                </Button>
              </div>
              {relevantPresetApps.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  No presets applied to this {selection.type}.
                </p>
              )}
              {relevantPresetApps.map(({ pa, index }) => {
                const fullPreset = presets?.find((p) => p.id === pa.presetId)
                const presetEffects = fullPreset?.effects ?? []
                return (
                  <PresetApplicationSummary
                    key={`preset-${index}`}
                    presetName={pa.presetName}
                    presetId={pa.presetId}
                    effects={presetEffects.map((e) => fromPresetEffect(e, library))}
                    targets={pa.targets}
                    palette={palette}
                    onClick={() => setEditingPresetIndex(index)}
                    actions={
                      <>
                        <TimingBadge
                          delayMs={pa.delayMs}
                          intervalMs={pa.intervalMs}
                          randomWindowMs={pa.randomWindowMs}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            onRemovePreset(index)
                          }}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </>
                    }
                  />
                )
              })}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function FixtureDetailPane({ fixtureKey }: { fixtureKey: string }) {
  const { data: fixtures, isLoading } = useFixtureListQuery()
  const fixture = fixtures?.find((f) => f.key === fixtureKey)

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="size-4 animate-spin" />
      </div>
    )
  }
  if (!fixture) {
    return <p className="text-sm text-muted-foreground">Fixture not found</p>
  }
  return <FixtureContent fixture={fixture} isEditing viewMode="properties" />
}

function GroupDetailPane({ groupName }: { groupName: string }) {
  const { data: properties, isLoading } = useGroupPropertiesQuery(groupName)
  return (
    <GroupPropertiesSection
      groupName={groupName}
      properties={properties}
      isLoading={isLoading}
      isEditing
    />
  )
}
