import { useCallback } from 'react'
import { OctagonX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BeatIndicator } from '@/components/BeatIndicator'
import { useFxStateQuery, tapTempo } from '@/store/fx'
import { useRemoveFxMutation } from '@/store/fixtureFx'
import { BEAT_DIVISION_OPTIONS } from '@/components/fixtures/fx/fxConstants'

interface BuskingTopBarProps {
  defaultBeatDivision: number
  onBeatDivisionChange: (value: number) => void
}

export function BuskingTopBar({
  defaultBeatDivision,
  onBeatDivisionChange,
}: BuskingTopBarProps) {
  const { data: fxState } = useFxStateQuery()
  const [removeFx] = useRemoveFxMutation()

  const handleTap = useCallback(() => {
    tapTempo()
  }, [])

  const handleKillAll = useCallback(async () => {
    if (!fxState?.activeEffects.length) return
    await Promise.all(
      fxState.activeEffects.map((effect) =>
        removeFx({ id: effect.id, fixtureKey: effect.targetKey }).unwrap().catch(() => {}),
      ),
    )
  }, [fxState, removeFx])

  const runningCount = fxState?.activeEffects.filter((e) => e.isRunning).length ?? 0
  const totalCount = fxState?.activeEffects.length ?? 0

  return (
    <div className="border-b bg-background px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Beat + BPM */}
        <div className="flex items-center gap-2">
          <BeatIndicator />
          <span className="text-sm font-medium text-muted-foreground">BPM</span>
          <span className="min-w-[4ch] text-right text-xl font-bold tabular-nums">
            {fxState?.bpm.toFixed(1) ?? '—'}
          </span>
        </div>

        {/* Tap Tempo */}
        <Button variant="outline" size="sm" onClick={handleTap}>
          Tap
        </Button>

        {/* Beat Division Strip */}
        <ToggleGroup
          type="single"
          value={String(defaultBeatDivision)}
          onValueChange={(v) => {
            if (v) onBeatDivisionChange(parseFloat(v))
          }}
          className="gap-0.5"
        >
          {BEAT_DIVISION_OPTIONS.map((opt) => (
            <ToggleGroupItem
              key={opt.value}
              value={String(opt.value)}
              size="sm"
              className="text-xs px-2 h-8"
            >
              {opt.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {/* Running count */}
        <span className="text-xs text-muted-foreground">
          {totalCount === 0
            ? 'No FX'
            : `${runningCount}/${totalCount} FX`}
        </span>

        {/* Kill All */}
        <Button
          variant="destructive"
          size="sm"
          onClick={handleKillAll}
          disabled={totalCount === 0}
          className="ml-auto"
        >
          <OctagonX className="size-4 mr-1" />
          Kill All
        </Button>
      </div>
    </div>
  )
}
