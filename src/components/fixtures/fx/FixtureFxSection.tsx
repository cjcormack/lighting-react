import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AudioWaveform, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { useFixtureEffectsQuery, type FixtureDirectEffect } from '@/store/fixtureFx'
import { type Fixture } from '@/store/fixtures'
import { ActiveEffectItem } from './ActiveEffectItem'
import { AddEditFxSheet } from './AddEditFxSheet'

type SheetState =
  | { mode: 'closed' }
  | { mode: 'add' }
  | { mode: 'edit'; effectId: number; effect: FixtureDirectEffect }

interface FixtureFxSectionProps {
  fixture: Fixture
}

export function FixtureFxSection({ fixture }: FixtureFxSectionProps) {
  const { data: effects, isLoading } = useFixtureEffectsQuery(fixture.key)
  const [isExpanded, setIsExpanded] = useState(false)
  const [sheetState, setSheetState] = useState<SheetState>({ mode: 'closed' })

  const directEffects = effects?.direct ?? []
  const indirectEffects = effects?.indirect ?? []
  const totalCount = directEffects.length + indirectEffects.length

  if (isLoading) return null

  return (
    <div className="pt-3 border-t">
      <button
        className="w-full flex items-center justify-between text-sm"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <AudioWaveform className="size-4 text-muted-foreground" />
          <h4 className="font-medium text-muted-foreground">Effects</h4>
          {totalCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {totalCount}
            </Badge>
          )}
        </div>
        {isExpanded ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-2">
          {directEffects.map((effect) => (
            <ActiveEffectItem
              key={effect.id}
              effect={effect}
              kind="direct"
              fixtureKey={fixture.key}
              onEdit={() =>
                setSheetState({ mode: 'edit', effectId: effect.id, effect })
              }
            />
          ))}

          {indirectEffects.map((effect) => (
            <ActiveEffectItem
              key={effect.id}
              effect={effect}
              kind="indirect"
              fixtureKey={fixture.key}
            />
          ))}

          {totalCount === 0 && (
            <p className="text-xs text-muted-foreground">No effects active</p>
          )}

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setSheetState({ mode: 'add' })}
          >
            <Plus className="size-4 mr-1" /> Add Effect
          </Button>
        </div>
      )}

      <AddEditFxSheet
        fixture={fixture}
        mode={sheetState.mode === 'closed' ? undefined : sheetState}
        onClose={() => setSheetState({ mode: 'closed' })}
      />
    </div>
  )
}
