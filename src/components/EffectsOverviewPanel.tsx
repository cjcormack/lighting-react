import { useCallback } from 'react'
import { Loader2, OctagonX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useFxStateQuery } from '@/store/fx'
import { useRemoveFxMutation } from '@/store/fixtureFx'
import { tapSpeedMaster, useSpeedMasterLiveQuery } from '@/store/speedMasters'
import { ignoreReportedError } from '@/store/errorToastMiddleware'
import { BeatIndicator } from './BeatIndicator'
import { CollapsiblePanel } from './CollapsiblePanel'

interface EffectsOverviewPanelProps {
  isVisible: boolean
  /** When locked (FX view), show extended controls like Kill All */
  isLocked?: boolean
  isDesktop: boolean
}

export function EffectsOverviewPanel({ isVisible, isLocked, isDesktop }: EffectsOverviewPanelProps) {
  return (
    <CollapsiblePanel isVisible={isVisible}>
      <EffectsOverviewPanelBody isLocked={isLocked} isDesktop={isDesktop} />
    </CollapsiblePanel>
  )
}

/**
 * Below the collapse boundary: the fx-state and speed-master subscriptions, and the
 * [BeatIndicator]'s free-running interval — which ran on every route when this was one component.
 */
function EffectsOverviewPanelBody({
  isLocked,
  isDesktop,
}: Omit<EffectsOverviewPanelProps, 'isVisible'>) {
  const { data: fxState, isLoading } = useFxStateQuery()
  const [removeFx] = useRemoveFxMutation()
  // Tempo comes from the speed-master bank, not from the fx frame: `fxState` carried master
  // 1's bpm only because it predates the bank, and its seeded default made this panel state
  // a tempo nobody had set until the first frame — the same reason the ShowBar moved off it.
  //
  // Narrowed with selectFromResult, as `useSpeedMasterDisplay` and `useMaster1Uuid` are: the
  // live-bank array is rebuilt on every master's tempo push, so selecting the whole thing
  // would re-render this whole panel while an unrelated master's knob is being dragged.
  const { master1 } = useSpeedMasterLiveQuery(undefined, {
    selectFromResult: ({ data }) => ({ master1: data?.find((m) => m.index === 1) }),
  })

  const handleTap = useCallback(() => {
    tapSpeedMaster(master1?.uuid ?? null)
  }, [master1?.uuid])

  const handleKillAll = useCallback(async () => {
    if (!fxState?.activeEffects.length) return
    await Promise.all(
      fxState.activeEffects.map((effect) =>
        removeFx({ id: effect.id, fixtureKey: effect.targetKey }).unwrap().catch(ignoreReportedError),
      ),
    )
  }, [fxState, removeFx])

  const runningCount = fxState?.activeEffects.filter((e) => e.isRunning).length ?? 0
  const totalCount = fxState?.activeEffects.length ?? 0

  return (
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
              {master1?.bpm.toFixed(1) ?? '—'}
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
        /* MOBILE: one compact row of controls. It was two until the palette strip below it
           went; the wrapper went with it. */
        <div className="flex items-center gap-3">
          <BeatIndicator />
          <span className="text-lg font-bold tabular-nums min-w-[4ch] text-right">
            {master1?.bpm.toFixed(1) ?? '—'}
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
      )}
    </div>
  )
}
