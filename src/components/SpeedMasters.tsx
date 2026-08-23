import { useRef } from 'react'
import { Link, useParams } from 'react-router'
import { ChevronDown, Settings2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { BeatIndicator } from './BeatIndicator'
import { formatBpm, useBpmDraft } from '../hooks/useBpmDraft'
import { usePersistentState } from '../hooks/usePersistentState'
import { setSpeedMasterBpm, tapSpeedMaster, useSpeedMasterLiveQuery } from '../store/speedMasters'
import type { SpeedMasterLiveState } from '../api/speedMastersWsApi'

/**
 * A master as this file draws it: the live shape, but with `bpm` widened so the pre-boot
 * placeholder can say "—" rather than a fabricated number.
 */
type TileMaster = Omit<SpeedMasterLiveState, 'bpm'> & { bpm: number | null }

/**
 * What to draw before the first `speedMasters` frame arrives.
 *
 * The ShowBar used to read `fxState.bpm`, which defaults to a hardcoded 120 — so for a frame or
 * two at boot the desk stated a tempo nobody had set. `getState()` is honestly empty instead, and
 * a null bpm renders "—". TAP still works (a null uuid *is* master 1 on the wire); click-to-edit
 * does not, because there is no current value to seed the draft from.
 */
/**
 * How wide the bar must be before a bank of *this many* masters each gets a tile.
 *
 * Width alone was the wrong test. A named tile runs ~150px and everything else on the bar —
 * blackout, the programmer chip, BACK and GO — is `shrink-0`, so every extra tile comes straight
 * out of the live-state block, which is the only `flex-1` item and the one thing an operator
 * actually reads mid-show. At 1000px a four-master bank ate ~600px and left its cue numbers
 * clipping. A container query cannot see how many masters there are, so the count picks the
 * threshold and the query applies it.
 *
 * Indexed by master count. Absent — five or more — means never tile at any width: the rail reaches
 * every master anyway, so consolidating loses nothing, and a bank that big is a bank you manage on
 * its own page rather than read off the show bar.
 *
 * Both halves of each pair live on one line because they must stay exact complements, and Tailwind
 * only sees whole literal class strings, so neither can be computed from the other.
 */
const TILED_ARM: Record<number, { show: string; hide: string }> = {
  1: { show: 'hidden @[1000px]:flex', hide: '@[1000px]:hidden' },
  2: { show: 'hidden @[1000px]:flex', hide: '@[1000px]:hidden' },
  3: { show: 'hidden @[1300px]:flex', hide: '@[1300px]:hidden' },
  4: { show: 'hidden @[1600px]:flex', hide: '@[1600px]:hidden' },
}

const PENDING_MASTER_1: TileMaster = {
  uuid: null,
  index: 1,
  name: '',
  bpm: null,
  isRunning: false,
  source: 'MANUAL',
}

/**
 * The desk's tempo surface: every speed master, **including master 1**.
 *
 * Master 1 used to be the ShowBar's own BPM tile and this component rendered only 2..N. That split
 * was the width problem: two thresholds fired at 560px in opposite directions, so between 560 and
 * 900px the M1 tile, the strip's single tile and the transport together left the live-state block
 * nothing, and its cue numbers spilled. One tile that speaks for the whole bank frees that room and
 * removes the split brain, at the cost of nothing — master 1 is still what a null uuid means on the
 * wire, so TAP and setBpm are unchanged.
 *
 * Self-contained like `ProgrammerIndicator`: reads its own state and takes no data props. Three
 * arms, chosen by the ShowBar's `@container` width *and* by how many masters there are:
 *
 *  - **wide enough for this bank** — one tile per master, each named, plus the manage shortcut.
 *    "Wide enough" comes from `TILED_ARM`, because it depends on the count; five or more never
 *    qualifies.
 *  - **≥440px otherwise** — one railed tile: a pill per master picks which one it shows.
 *  - **<440px** — `SpeedMastersChip`, a single readout that opens every master in a popover.
 *
 * Every arm that can render is in the DOM at once. That is deliberate and cheap: `BeatIndicator`
 * for master 1 uses the legacy *unkeyed* `beatSync` stream, so duplicating it costs one shared
 * subscription, the keyed subscriptions total N−1 whichever arms are visible, and an unopened Radix
 * popover mounts only its trigger.
 */
export function SpeedMasters() {
  const { data: live } = useSpeedMasterLiveQuery()
  // A new key rather than a migration of `showbar.speedMaster.selected`: existing desks have `2`
  // stored, which is still a *valid* index, so reusing the key would silently land them on M2 and
  // defeat the whole point of the rail now starting at M1.
  const [selectedIndex, setSelectedIndex] = usePersistentState<number>(
    'showbar.speedMaster.selected.v2',
    1,
  )

  const masters: TileMaster[] = live?.length ? live : [PENDING_MASTER_1]
  const selected = masters.find((m) => m.index === selectedIndex) ?? masters[0]

  const tiledArm = TILED_ARM[masters.length]

  return (
    <>
      {/* A tile each — only while the bank is small enough to be worth the room. */}
      {tiledArm && (
        <div className={cn('items-stretch gap-2 shrink-0', tiledArm.show)}>
          {masters.map((m) => (
            <div
              key={m.uuid ?? m.index}
              className="flex items-stretch rounded-md border bg-card overflow-hidden"
            >
              <MasterTile master={m} />
            </div>
          ))}
          <ManageMastersLink />
        </div>
      )}

      {/* One tile with a rail to pick which master it shows. Takes over from 440px up — and all the
          way up, on a bank too big to tile. Nothing is lost either way: the rail reaches every
          master, which is the whole point of consolidating rather than dropping. */}
      <div className={cn('hidden @[440px]:flex items-stretch gap-2 shrink-0', tiledArm?.hide)}>
        <div className="flex items-stretch rounded-md border bg-card overflow-hidden">
          <MasterRail masters={masters} selected={selected} onSelect={setSelectedIndex} />
          <MasterTile master={selected} />
        </div>
        {/* A bank too big to tile never renders the arm that carries this, and would otherwise
            lose its only route to the bank page. */}
        {!tiledArm && (
          <span className="hidden @[1000px]:flex">
            <ManageMastersLink />
          </span>
        )}
      </div>

      {/* <440px — one chip; the popover carries the whole bank. */}
      <SpeedMastersChip className="@[440px]:hidden" />
    </>
  )
}

/**
 * The phone-width tempo control: master 1's readout, a count of the masters it is standing in for,
 * and a popover holding every master with its own TAP.
 *
 * Exported because two surfaces have no `@container` ancestor to query and so must ask for this arm
 * by name — `RunMobile` and the Prompt Book's cue-stack drawer. Both previously hand-rolled a bpm
 * readout beside the strip, which meant neither could see any master but 1; this is how they gain
 * the rest of the bank.
 */
export function SpeedMastersChip({ className }: { className?: string }) {
  const { data: live } = useSpeedMasterLiveQuery()
  const masters: TileMaster[] = live?.length ? live : [PENDING_MASTER_1]
  const primary = masters.find((m) => m.index === 1) ?? masters[0]
  const extra = masters.length - 1
  const contentRef = useRef<HTMLDivElement>(null)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Speed masters"
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-md border bg-card px-2 py-1 transition-colors hover:bg-muted/40',
            className,
          )}
        >
          <BeatIndicator master={asLive(primary)} className="size-1.5 shrink-0" />
          <span className="font-mono text-[13px] font-bold leading-none tabular-nums">
            {primary.bpm == null ? '—' : formatBpm(primary.bpm)}
          </span>
          {/* The one thing today's phone ladder cannot say: there ARE other masters. */}
          {extra > 0 && <span className="text-[10px] text-muted-foreground">+{extra}</span>}
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        align="start"
        className="w-[230px] p-2"
        onEscapeKeyDown={(e) => {
          // Escape inside a BPM field reverts that draft (`useBpmDraft`), and must not ALSO throw
          // away the popover the operator is working in. Radix listens on `document` in the capture
          // phase, so stopping propagation from the input cannot reach it — preventing the default
          // here is the documented way, and the event still goes on to revert the draft.
          const active = document.activeElement
          if (active instanceof HTMLInputElement && contentRef.current?.contains(active)) {
            e.preventDefault()
          }
        }}
      >
        <p className="px-1 pb-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Speed masters
        </p>
        <div className="flex flex-col gap-px">
          {masters.map((m) => (
            <MasterRow key={m.uuid ?? m.index} master={m} />
          ))}
        </div>
        <ManageMastersLink variant="row" />
      </PopoverContent>
    </Popover>
  )
}

/** Which master the single tile shows. Pointless with a one-master bank, so it hides itself. */
function MasterRail({
  masters,
  selected,
  onSelect,
}: {
  masters: TileMaster[]
  selected: TileMaster
  onSelect: (index: number) => void
}) {
  if (masters.length < 2) return null

  return (
    // Two rows, flowing into columns: a vertical list of pills outgrows the tile's height at four
    // masters and pushes the whole bar taller. This caps the height and spends width instead, which
    // is what the bar has more of.
    <div className="grid grid-flow-col grid-rows-2 content-center gap-px border-r bg-muted/30 px-1">
      {masters.map((m) => (
        <button
          key={m.uuid ?? m.index}
          type="button"
          onClick={() => onSelect(m.index)}
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
  )
}

/**
 * Shortcut to the Speed Masters page, for adding or renaming a master mid-show without hunting
 * through the sidebar.
 *
 * Renders nothing off a project-scoped route. `variant="row"` is the popover's full-width footer —
 * at phone widths there is otherwise no route to the bank page at all.
 */
function ManageMastersLink({ variant = 'icon' }: { variant?: 'icon' | 'row' }) {
  const { projectId } = useParams<{ projectId: string }>()
  if (projectId == null) return null

  const to = `/projects/${projectId}/speed-masters`
  if (variant === 'row') {
    return (
      <Link
        to={to}
        className="mt-1.5 flex items-center gap-1.5 rounded border-t px-1 pt-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <Settings2 className="size-3" />
        Manage speed masters
      </Link>
    )
  }

  return (
    <Link
      to={to}
      title="Manage speed masters"
      aria-label="Manage speed masters"
      className="flex items-center rounded-md border bg-card px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Settings2 className="size-3.5" />
    </Link>
  )
}

/**
 * One master's readout + TAP. The BPM value is a click-to-edit input with dirty tracking: while the
 * operator is typing, server pushes are ignored so a tap from another surface can't yank the field
 * out from under them; Enter or blur commits, Escape reverts.
 *
 * This edits the **live** tempo (`speedMasters.setBpm`), never the stored default — that stays
 * editable only in the detail sheet, where it can be labelled as such. Master 1 is edited here on
 * exactly the same terms as the rest: it used to be a read-only span in the ShowBar, which made the
 * global tempo the one master you could not type at while standing at the desk.
 */
function MasterTile({ master }: { master: TileMaster }) {
  const { editing, draft, start, change, commit, onKeyDown } = useBpmDraft(master.uuid, (bpm) =>
    setSpeedMasterBpm(master.uuid, bpm),
  )

  return (
    <>
      <div className="flex flex-col justify-start gap-px px-3 py-1.5">
        <span className="flex items-center gap-1 truncate max-w-[18ch] text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          <BeatIndicator master={asLive(master)} className="size-1.5 shrink-0" />
          M{master.index}
          {/* Only the ≥1000px arm is on screen above 1000, so this one span serves both the wide
              tile's "M1 · BPM" and the railed tile's bare "M1" without a prop or a branch. */}
          {master.name && <span className="hidden @[1000px]:inline"> · {master.name}</span>}
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
            className="w-[5ch] border-b border-primary bg-transparent font-mono text-lg font-bold leading-none text-foreground outline-none @max-[700px]:text-[15px]"
          />
        ) : (
          <button
            type="button"
            disabled={master.bpm == null}
            onClick={() => master.bpm != null && start(master.bpm)}
            title={`Master ${master.index} — click to type a tempo`}
            className="text-left font-mono text-lg font-bold leading-none tabular-nums text-foreground transition-colors hover:text-primary disabled:hover:text-foreground @max-[700px]:text-[15px]"
          >
            {master.bpm == null ? '—' : formatBpm(master.bpm)}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => tapSpeedMaster(master.uuid)}
        aria-label={`Tap tempo for master ${master.index}`}
        className="flex items-center justify-center border-l px-3 text-xs font-bold uppercase tracking-[0.08em] transition-colors hover:bg-primary hover:text-primary-foreground active:bg-primary active:text-primary-foreground @max-[700px]:px-2 @max-[700px]:text-[11px]"
      >
        TAP
      </button>
    </>
  )
}

/**
 * One master inside the phone popover. A row rather than a reused `MasterTile` because the layouts
 * genuinely differ — horizontal, name-first — but nothing is duplicated: both go through
 * `useBpmDraft`, `tapSpeedMaster` and `BeatIndicator`, which is where the behaviour lives.
 */
function MasterRow({ master }: { master: TileMaster }) {
  const { editing, draft, start, change, commit, onKeyDown } = useBpmDraft(master.uuid, (bpm) =>
    setSpeedMasterBpm(master.uuid, bpm),
  )

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded px-1.5 py-1',
        master.index === 1 && 'bg-muted',
      )}
    >
      <BeatIndicator master={asLive(master)} className="size-1.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
        M{master.index}
        {master.name && ` · ${master.name}`}
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
          className="w-[5ch] border-b border-primary bg-transparent text-right font-mono text-sm font-bold leading-none outline-none"
        />
      ) : (
        <button
          type="button"
          disabled={master.bpm == null}
          onClick={() => master.bpm != null && start(master.bpm)}
          title={`Master ${master.index} — click to type a tempo`}
          className="font-mono text-sm font-bold tabular-nums transition-colors hover:text-primary disabled:hover:text-foreground"
        >
          {master.bpm == null ? '—' : formatBpm(master.bpm)}
        </button>
      )}
      <button
        type="button"
        onClick={() => tapSpeedMaster(master.uuid)}
        aria-label={`Tap tempo for master ${master.index}`}
        className="rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] transition-colors hover:bg-primary hover:text-primary-foreground"
      >
        TAP
      </button>
    </div>
  )
}

/**
 * `BeatIndicator` wants the live shape. The only difference is the pre-boot null bpm, which it
 * never reads — it resolves its stream from `index`/`uuid` alone.
 */
function asLive(master: TileMaster): SpeedMasterLiveState {
  return { ...master, bpm: master.bpm ?? 0 }
}
