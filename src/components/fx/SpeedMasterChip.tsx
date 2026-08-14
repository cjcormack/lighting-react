import { Badge } from '@/components/ui/badge'
import { useSpeedMasterDisplay } from '../../store/speedMasters'

/**
 * "Runs on M2" chip for effect summaries and FX-sheet chips.
 *
 * Renders **nothing when the effect resolves to master 1** — the rule (and the
 * only-re-render-on-own-master subscription) lives in [useSpeedMasterDisplay], shared with
 * the FX sheet's inline label so the two can't drift.
 */
export function SpeedMasterChip({ speedMasterUuid }: { speedMasterUuid: string | null | undefined }) {
  const master = useSpeedMasterDisplay(speedMasterUuid)
  if (!master) return null

  return (
    <Badge
      variant="outline"
      className="text-[10px] leading-tight px-1 py-0 shrink-0 font-mono"
      title={`Runs on speed master ${master.index} — ${master.name}`}
    >
      M{master.index}
    </Badge>
  )
}
