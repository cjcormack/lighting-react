import { Clock, Timer, Repeat } from 'lucide-react'

function formatMs(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

interface TimingBadgeProps {
  delayMs?: number | null
  intervalMs?: number | null
  randomWindowMs?: number | null
}

/**
 * Small inline badge showing timing configuration on preset/effect summary cards.
 * Only renders when timing is configured (non-immediate).
 */
export function TimingBadge({ delayMs, intervalMs, randomWindowMs }: TimingBadgeProps) {
  if (!delayMs && !intervalMs) return null

  if (intervalMs) {
    const label = randomWindowMs
      ? `every ~${formatMs(intervalMs)} (\u00b1${formatMs(randomWindowMs)})`
      : `every ${formatMs(intervalMs)}`
    return (
      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
        <Repeat className="size-2.5" />
        {label}
      </span>
    )
  }

  if (delayMs) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
        <Timer className="size-2.5" />
        {formatMs(delayMs)} delay
      </span>
    )
  }

  return null
}
