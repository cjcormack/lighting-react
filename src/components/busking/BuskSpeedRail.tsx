import { useMemo } from 'react'
import { useParams } from 'react-router'
import { Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BeatIndicator } from '@/components/BeatIndicator'
import { ManageMastersLink } from '@/components/SpeedMasters'
import { formatBpm, useBpmDraft } from '@/hooks/useBpmDraft'
import {
  setSpeedMasterBpm,
  tapSpeedMaster,
  useSaveSpeedMasterMutation,
  useSpeedMasterListQuery,
  useSpeedMasterLiveQuery,
} from '@/store/speedMasters'
import {
  FOLLOW_RATIOS,
  describeFollow,
  followRatioOf,
  followerTempoLockedReason,
  usageLabel,
} from '@/lib/speedMasterModel'
import { useIsDeskConnected } from '@/store/status'
import { DESK_OFFLINE_LABEL } from '@/api/wsGesture'
import type { SpeedMasterLiveState } from '@/api/speedMastersWsApi'

/**
 * The busk view's speed rail: the whole bank, one card each, down the right-hand side.
 *
 * The rail is what makes the routing sessions 1-2 built *visible*. A busked effect with no explicit
 * master is stamped with the usage-matching master at the moment of the press, and until now the
 * only place that fact appeared was inside the long-press configure sheet. Here every master says
 * what it is for, and the caption at the top says the rule once.
 *
 * **Two queries, and each is load-bearing.** The live query supplies everything drawn — since the
 * busking-view plan's session 2 the WS state carries `usage` and the follow pair alongside the
 * running tempo, so nothing here needs the REST row to render. The list query supplies the numeric
 * `id`, which live state has no field for and a ratio-chip PUT cannot do without. They are joined
 * by uuid, the same join `routes/SpeedMasters.tsx` makes for the same reason.
 *
 * **This is the fourth surface offering TAP and click-to-type**, after `MasterTile`, `MasterRow`
 * and `SpeedMasterRow`, so it carries the same follower arm they do: a master deriving its tempo
 * from master 1 is offered neither, because the server refuses both (`SPEED_MASTER_FOLLOWER`) and
 * nothing on a desk should be a button that cannot work.
 *
 * Not rendered below `md`. The ShowBar above it already carries `SpeedMastersChip`, which reaches
 * every master in a popover; a 288px rail at phone width would be the pads' whole width.
 */
export function BuskSpeedRail() {
  const { projectId } = useParams<{ projectId: string }>()
  const projectIdNum = Number(projectId)
  const { data: live } = useSpeedMasterLiveQuery()
  const { data: rows } = useSpeedMasterListQuery(
    { projectId: projectIdNum },
    { skip: !Number.isFinite(projectIdNum) },
  )

  // Only the id is taken from the REST row. Everything displayed comes from the live frame, so a
  // stale list cannot make the rail state a tempo, a usage or a ratio the desk is not running.
  const idByUuid = useMemo(
    () => new Map((rows ?? []).map((row) => [row.uuid, row.id] as const)),
    [rows],
  )

  return (
    <div className="hidden w-72 shrink-0 flex-col gap-2.5 overflow-y-auto border-l p-3 md:flex">
      <div>
        <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Speed
        </span>
        <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
          Effects busked with no explicit master follow the master matching their family.
        </p>
      </div>

      {(live ?? []).map((master) => (
        <MasterCard
          key={master.uuid ?? master.index}
          master={master}
          projectId={projectIdNum}
          masterId={master.uuid == null ? undefined : idByUuid.get(master.uuid)}
        />
      ))}

      <div className="flex-1" />
      <ManageMastersLink variant="row" />
    </div>
  )
}

/**
 * One master, in one of three arms.
 *
 * - **Master 1** is the global tempo: the big number, a full-width TAP, and no usage badge — it is
 *   where every unmatched category lands by definition, so a badge saying so would be noise.
 * - **A follower** shows what it derives and the ratio it derives at, and trades TAP for the five
 *   ratio chips. Its tempo is not typeable either: the same refusal covers both writes.
 * - **A manual master** keeps its own TAP inline, and carries its usage badge.
 */
function MasterCard({
  master,
  projectId,
  masterId,
}: {
  master: SpeedMasterLiveState
  projectId: number
  masterId: number | undefined
}) {
  const connected = useIsDeskConnected()
  const { editing, draft, start, change, commit, onKeyDown } = useBpmDraft(master.uuid, (bpm) =>
    setSpeedMasterBpm(master.uuid, bpm),
  )
  const isMaster1 = master.index === 1
  const follow = followRatioOf(master)
  const lockedReason = follow
    ? followerTempoLockedReason(master.name || `Master ${master.index}`, follow.num, follow.den)
    : null
  const usage = usageLabel(master.usage)

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        <BeatIndicator master={master} className="size-1.5 shrink-0" />
        <span className="truncate">
          M{master.index}
          {master.name && ` · ${master.name}`}
        </span>
        <span className="flex-1" />
        {/* Master 1 never carries one: it is the fallback for every category no other master
            claims, so "routes dimmer" would understate it and any single label would be wrong. */}
        {!isMaster1 && usage && (
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[9px] font-bold tracking-[0.06em]">
            {usage}
          </span>
        )}
      </span>

      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-baseline gap-1.5">
          {editing ? (
            <input
              autoFocus
              inputMode="decimal"
              value={draft}
              onChange={(e) => change(e.target.value)}
              onBlur={commit}
              onKeyDown={onKeyDown}
              aria-label={`Master ${master.index} BPM`}
              className={cn(
                'w-[5ch] border-b border-primary bg-transparent font-mono font-bold leading-none tabular-nums outline-none',
                isMaster1 ? 'text-3xl' : 'text-lg',
              )}
            />
          ) : (
            <button
              type="button"
              disabled={!connected || lockedReason != null}
              onClick={() => start(master.bpm)}
              title={
                lockedReason ??
                (connected ? `Master ${master.index} — click to type a tempo` : DESK_OFFLINE_LABEL)
              }
              className={cn(
                'font-mono font-bold leading-none tabular-nums transition-colors hover:text-primary disabled:hover:text-foreground',
                isMaster1 ? 'text-3xl' : 'text-lg',
              )}
            >
              {formatBpm(master.bpm)}
            </button>
          )}
          {isMaster1 ? (
            <span className="text-[10px] text-muted-foreground">BPM</span>
          ) : follow ? (
            <span
              className="flex items-center gap-1 text-[10px] text-muted-foreground"
              title={lockedReason ?? undefined}
            >
              <Link2 className="size-2.5 shrink-0" />
              {describeFollow(follow.num, follow.den)}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">manual</span>
          )}
        </div>

        {/* A follower's TAP is not disabled, it is absent — the chips take the cell instead, so
            linking a master swaps one control for another rather than leaving a dead button. */}
        {!follow && !isMaster1 && (
          <TapButton master={master} connected={connected} className="h-8 px-3.5" />
        )}
      </div>

      {/* Master 1 can never follow (the server refuses it a ratio), so its TAP needs no guard. */}
      {isMaster1 && <TapButton master={master} connected={connected} className="h-11 w-full" />}

      {follow && (
        <RatioChips
          index={master.index}
          projectId={projectId}
          masterId={masterId}
          current={follow}
        />
      )}
    </div>
  )
}

function TapButton({
  master,
  connected,
  className,
}: {
  master: SpeedMasterLiveState
  connected: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={() => tapSpeedMaster(master.uuid)}
      disabled={!connected}
      title={connected ? undefined : DESK_OFFLINE_LABEL}
      aria-label={`Tap tempo for master ${master.index}`}
      className={cn(
        'flex items-center justify-center rounded-md border text-xs font-bold uppercase tracking-[0.08em] transition-colors',
        'hover:bg-primary hover:text-primary-foreground active:bg-primary active:text-primary-foreground',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
    >
      TAP
    </button>
  )
}

/**
 * The five time signatures, in the cell TAP would have had.
 *
 * This is the **second** surface that can write a follow ratio — until now only
 * `SpeedMasterDetailSheet` could — and it writes the same way that one does, for the same reasons:
 * both halves of the pair or neither (a half-patch is a 400), and **never alongside `bpm`**, which
 * the server refuses on a follower because its tempo comes from master 1 rather than from a stored
 * default. The response's `bpm` is deliberately not read: it is the pre-link stored value beside
 * the ratio it just accepted (`FU-SPEED-LINK-PUT-STALE-BPM`), and the state frame corrects it.
 *
 * Only reachable on a master that is already following: linking and unlinking stay in the sheet,
 * where the choice can be labelled. Retuning a link mid-show is the gesture that belongs on a
 * performance surface; deciding whether to have one is not.
 */
function RatioChips({
  index,
  projectId,
  masterId,
  current,
}: {
  index: number
  projectId: number
  masterId: number | undefined
  current: { num: number; den: number }
}) {
  const [saveMaster, { isLoading }] = useSaveSpeedMasterMutation()

  return (
    <div className="flex gap-1" role="group" aria-label={`Master ${index} time signature`}>
      {FOLLOW_RATIOS.map((ratio) => {
        const active = ratio.num === current.num && ratio.den === current.den
        return (
          <button
            key={ratio.label}
            type="button"
            aria-pressed={active}
            aria-label={`Follow master 1 at ${ratio.num}/${ratio.den}`}
            // No id means the REST list has not arrived (or this is the pre-boot synthetic master
            // 1, which never follows anyway); the chip has nothing to address until it does.
            disabled={masterId == null || isLoading || active}
            onClick={() => {
              if (masterId == null) return
              void saveMaster({
                projectId,
                masterId,
                followNum: ratio.num,
                followDen: ratio.den,
              })
                .unwrap()
                .catch(() => {
                  // Reported by `errorToastMiddleware`; nothing moved, so nothing to undo.
                })
            }}
            className={cn(
              'inline-flex h-7 min-w-[34px] items-center justify-center rounded-md border px-1.5 text-xs font-bold transition-all',
              'disabled:pointer-events-none',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
          >
            {ratio.label}
          </button>
        )
      })}
    </div>
  )
}
