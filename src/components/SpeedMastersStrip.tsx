import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { usePersistentState } from '../hooks/usePersistentState'
import { setSpeedMasterBpm, tapSpeedMaster, useSpeedMasterLiveQuery } from '../store/speedMasters'
import type { SpeedMasterLiveState } from '../api/speedMastersWsApi'

/**
 * The speed-masters strip: one tile per master beyond master 1, each with a live BPM
 * readout (click to type a tempo) and a TAP button.
 *
 * Master 1 is deliberately absent — it *is* the ShowBar's existing BPM tile (every legacy
 * tempo surface means master 1), and two readouts for the same master would drift in the
 * operator's head even though they never drift on the wire.
 *
 * Self-contained like `ProgrammerIndicator`: reads its own state, takes no data props, and
 * renders nothing until the bank has masters beyond M1 — so the three ShowBar call sites
 * did not change when this landed.
 *
 * Responsive collapse (inside the ShowBar's `@container`): every tile at `@[900px]`, one
 * sticky-selected tile with an M-switcher between `@[560px]` and `@[900px]`, nothing below
 * that (the M1 tile survives all widths). `compact` skips the container queries and always
 * renders the single-tile form — RunMobile's strip has no container to query.
 */
export function SpeedMastersStrip({ compact = false }: { compact?: boolean }) {
  const { data: masters } = useSpeedMasterLiveQuery()
  const [selectedIndex, setSelectedIndex] = usePersistentState<number>(
    'showbar.speedMaster.selected',
    2,
  )

  const others = (masters ?? []).filter((m) => m.index !== 1)
  if (others.length === 0) return null

  const selected = others.find((m) => m.index === selectedIndex) ?? others[0]

  const singleTile = (
    <div className="flex items-stretch rounded-md border bg-card overflow-hidden">
      {/* Segmented master switcher — which master the single tile shows. */}
      <div className="flex flex-col justify-center gap-px px-1 border-r bg-muted/30">
        {others.map((m) => (
          <button
            key={m.index}
            type="button"
            onClick={() => setSelectedIndex(m.index)}
            aria-pressed={m.index === selected.index}
            className={cn(
              'rounded px-1 text-[9px] font-bold leading-tight',
              m.index === selected.index
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            M{m.index}
          </button>
        ))}
      </div>
      <MasterTile master={selected} showName={false} />
    </div>
  )

  if (compact) return singleTile

  return (
    <>
      {/* Full strip — every master its own tile. */}
      <div className="hidden @[900px]:flex items-stretch gap-2 shrink-0">
        {others.map((m) => (
          <div key={m.uuid ?? m.index} className="flex items-stretch rounded-md border bg-card overflow-hidden">
            <MasterTile master={m} showName />
          </div>
        ))}
      </div>
      {/* Mid widths — the sticky-selected master only. */}
      <div className="hidden @[560px]:flex @[900px]:hidden items-stretch shrink-0">
        {singleTile}
      </div>
    </>
  )
}

/**
 * One master's readout + TAP, matching the ShowBar BPM-tile idiom. The BPM value is a
 * click-to-edit input with dirty tracking: while the operator is typing, server pushes are
 * ignored so a tap from another surface can't yank the field out from under them; Enter or
 * blur commits, Escape reverts.
 */
function MasterTile({ master, showName }: { master: SpeedMasterLiveState; showName: boolean }) {
  const [draft, setDraft] = useState<string | null>(null)
  const editing = draft != null

  // If the master under the tile changes (switcher click, delete), abandon the edit —
  // committing a half-typed tempo to a different master is worse than losing keystrokes.
  useEffect(() => {
    setDraft(null)
  }, [master.uuid])

  const commit = () => {
    if (draft == null) return
    const parsed = Number(draft)
    if (Number.isFinite(parsed) && parsed > 0) {
      setSpeedMasterBpm(master.uuid, parsed)
    }
    setDraft(null)
  }

  return (
    <>
      <div className="flex flex-col justify-start gap-px px-3 py-1.5">
        <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground truncate max-w-[10ch]">
          M{master.index}
          {showName && ` · ${master.name}`}
          {master.source === 'TAP' && !editing && ' · tap'}
        </span>
        {editing ? (
          <input
            autoFocus
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setDraft(null)
            }}
            aria-label={`Master ${master.index} BPM`}
            className="w-[5ch] bg-transparent font-mono text-lg font-bold leading-none text-foreground outline-none border-b border-primary"
          />
        ) : (
          <button
            type="button"
            onClick={() => setDraft(String(Math.round(master.bpm * 10) / 10))}
            title={`Master ${master.index} — click to type a tempo`}
            className="font-mono text-lg font-bold leading-none text-foreground text-left tabular-nums hover:text-primary transition-colors"
          >
            {Math.round(master.bpm * 10) / 10}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => tapSpeedMaster(master.uuid)}
        aria-label={`Tap tempo for master ${master.index}`}
        className="flex items-center justify-center px-3 text-xs font-bold tracking-[0.08em] uppercase border-l hover:bg-primary hover:text-primary-foreground transition-colors active:bg-primary active:text-primary-foreground"
      >
        TAP
      </button>
    </>
  )
}
