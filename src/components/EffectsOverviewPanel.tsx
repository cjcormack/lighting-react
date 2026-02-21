import { useCallback } from 'react'
import { Loader2, OctagonX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useFxStateQuery, tapTempo } from '@/store/fx'
import { useRemoveFxMutation } from '@/store/fixtureFx'
import { BeatIndicator } from './BeatIndicator'
import { PalettePanel } from './busking/PalettePanel'
import { ActiveStackPalettes } from './ActiveStackPalettes'

interface EffectsOverviewPanelProps {
  isVisible: boolean
  /** When locked (FX view), show extended controls like Kill All */
  isLocked?: boolean
  isDesktop: boolean
}

export function EffectsOverviewPanel({ isVisible, isLocked, isDesktop }: EffectsOverviewPanelProps) {
  const { data: fxState, isLoading } = useFxStateQuery()
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
    <div
      className={cn(
        'grid transition-all duration-200 ease-in-out',
        isVisible ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      )}
    >
      <div className="overflow-hidden">
        <div className={cn("border-b bg-background px-4", isDesktop ? "py-3" : "py-2")}>
          {isLoading ? (
            <div className="flex justify-center">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : isDesktop ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {/* Beat Indicator + BPM Display */}
              <div className="flex items-center gap-3">
                <BeatIndicator />
                <span className="text-sm font-medium text-muted-foreground">BPM</span>
                <span className="min-w-[5ch] text-right text-2xl font-bold tabular-nums">
                  {fxState?.bpm.toFixed(1) ?? '—'}
                </span>
              </div>

              {/* Tap Button */}
              <Button variant="outline" size="sm" onClick={handleTap}>
                Tap
              </Button>

              {/* Running FX Summary */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {totalCount === 0
                    ? 'No active effects'
                    : `${runningCount} running / ${totalCount} effect${totalCount !== 1 ? 's' : ''}`}
                </span>
              </div>

              {/* Palette — global, then active cue stack palettes inline */}
              <PalettePanel label="Global" />
              <ActiveStackPalettes />

              {/* Kill All - shown when in FX view (locked), pushed to end */}
              {isLocked && (
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
              )}
            </div>
          ) : (
            /* MOBILE: two-row compact layout */
            <div className="space-y-2">
              {/* Row 1: Controls */}
              <div className="flex items-center gap-3">
                <BeatIndicator />
                <span className="text-lg font-bold tabular-nums min-w-[4ch] text-right">
                  {fxState?.bpm.toFixed(1) ?? '—'}
                </span>
                <Button variant="outline" size="sm" onClick={handleTap} className="px-2 h-7">
                  Tap
                </Button>
                <span className="text-xs text-muted-foreground">
                  {totalCount === 0 ? 'No FX' : `${runningCount}/${totalCount} FX`}
                </span>
                {isLocked && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleKillAll}
                    disabled={totalCount === 0}
                    className="ml-auto h-7 px-2"
                    title="Kill All"
                  >
                    <OctagonX className="size-3.5" />
                  </Button>
                )}
              </div>
              {/* Row 2: Palette strip (horizontal scroll) */}
              <div className="flex items-center gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-thin">
                <PalettePanel label="Global" compact />
                <ActiveStackPalettes compact />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
