import { Link, useParams } from 'react-router'
import { Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BeatIndicator } from './BeatIndicator'
import { formatBpm, useBpmDraft } from '../hooks/useBpmDraft'
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
        <ManageMastersLink />
      </div>
      {/* Mid widths — the sticky-selected master only. */}
      <div className="hidden @[560px]:flex @[900px]:hidden items-stretch shrink-0">
        {singleTile}
      </div>
    </>
  )
}

/**
 * Shortcut to the Speed Masters page, for adding or renaming a master mid-show without
 * hunting through the sidebar. Only rendered in the full strip: at mid widths the single
 * tile is already fighting for room, and the sidebar entry covers that case.
 *
 * Renders nothing off a project-scoped route — the strip's three hosts (Program, Run, Prompt
 * Book) are all under `/projects/:projectId`, so this is belt-and-braces rather than a case
 * that happens today.
 */
function ManageMastersLink() {
  const { projectId } = useParams<{ projectId: string }>()
  if (projectId == null) return null

  return (
    <Link
      to={`/projects/${projectId}/speed-masters`}
      title="Manage speed masters"
      aria-label="Manage speed masters"
      className="flex items-center rounded-md border bg-card px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Settings2 className="size-3.5" />
    </Link>
  )
}

/**
 * One master's readout + TAP, matching the ShowBar BPM-tile idiom. The BPM value is a
 * click-to-edit input with dirty tracking: while the operator is typing, server pushes are
 * ignored so a tap from another surface can't yank the field out from under them; Enter or
 * blur commits, Escape reverts.
 */
function MasterTile({ master, showName }: { master: SpeedMasterLiveState; showName: boolean }) {
  const { editing, draft, start, change, commit, onKeyDown } = useBpmDraft(
    master.uuid,
    (bpm) => setSpeedMasterBpm(master.uuid, bpm),
  )

  return (
    <>
      <div className="flex flex-col justify-start gap-px px-3 py-1.5">
        <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground truncate max-w-[12ch]">
          <BeatIndicator master={master} className="size-1.5 shrink-0" />
          M{master.index}
          {showName && ` · ${master.name}`}
          {master.source === 'TAP' && !editing && ' · tap'}
        </span>
        {editing ? (
          <input
            autoFocus
            inputMode="decimal"
            value={draft}
            onChange={(e) => change(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
            aria-label={`Master ${master.index} BPM`}
            className="w-[5ch] bg-transparent font-mono text-lg font-bold leading-none text-foreground outline-none border-b border-primary"
          />
        ) : (
          <button
            type="button"
            onClick={() => start(master.bpm)}
            title={`Master ${master.index} — click to type a tempo`}
            className="font-mono text-lg font-bold leading-none text-foreground text-left tabular-nums hover:text-primary transition-colors"
          >
            {formatBpm(master.bpm)}
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
