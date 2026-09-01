import { useState } from 'react'
import { useParams } from 'react-router'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { BeatIndicator } from '../components/BeatIndicator'
import { SpeedMasterDetailSheet } from '../components/speedMasters/SpeedMasterDetailSheet'
import { formatBpm, useBpmDraft } from '../hooks/useBpmDraft'
import { useProjectQuery } from '../store/projects'
import {
  setSpeedMasterBpm,
  tapSpeedMaster,
  useCreateSpeedMasterMutation,
  useSpeedMasterListQuery,
  useSpeedMasterLiveQuery,
} from '../store/speedMasters'
import {
  describeFollow,
  followRatioOf,
  formatFollowRatio,
  followerTempoLockedReason,
  usageLabel,
} from '../lib/speedMasterModel'
import type { SpeedMaster } from '../api/speedMastersApi'
import type { SpeedMasterLiveState } from '../api/speedMastersWsApi'
import { CurrentProjectRedirect } from '../components/CurrentProjectRedirect'

// Redirect /speed-masters → /projects/:projectId/speed-masters
export function SpeedMastersRedirect() {
  return <CurrentProjectRedirect to="speed-masters" />
}

/**
 * The speed-master bank: what tempo buses this show has, what they are running at, and what
 * follows them.
 *
 * Two sources, deliberately kept apart. The **list** query is the persisted row — identity,
 * name, notes, reference count, and the *starting* BPM. The **live** query is the running
 * bank — current tempo, whether the clock is going, and how the tempo was last set. A row
 * joins them by uuid and shows the live tempo, because that is the number an operator is
 * reading during a show; the stored default is only editable in the sheet, where it can be
 * labelled as such.
 *
 * The ShowBar's `SpeedMasters` surface lists every master too, master 1 included — the 2..N
 * split it used to draw is gone. What is still only here: renaming a master, annotating it,
 * creating and deleting one, and editing the *stored* default rather than the live tempo.
 */
export function ProjectSpeedMasters() {
  const { projectId } = useParams<{ projectId: string }>()
  const projectIdNum = Number(projectId)
  const { data: project } = useProjectQuery(projectIdNum)
  const { data: masters, isLoading } = useSpeedMasterListQuery({ projectId: projectIdNum })
  const { data: live } = useSpeedMasterLiveQuery()
  const [createMaster, { isLoading: isCreating }] = useCreateSpeedMasterMutation()
  const [openMaster, setOpenMaster] = useState<SpeedMaster | null>(null)

  // Keep the open sheet pointed at the freshest row: the list refetches whenever a master is
  // created, renamed or deleted, and a stale snapshot would show the pre-edit name.
  const openMasterId = openMaster?.id
  const currentOpenMaster = openMasterId == null
    ? null
    : (masters?.find((m) => m.id === openMasterId) ?? null)

  const liveByUuid = new Map((live ?? []).map((m) => [m.uuid, m]))

  return (
    <Card className="m-4 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Breadcrumbs projectName={project?.name ?? ''} currentPage="Speed Masters" />
        <Button size="sm" onClick={() => createMaster({ projectId: projectIdNum })} disabled={isCreating}>
          {isCreating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          New master
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {(masters ?? []).map((master) => (
            <SpeedMasterRow
              key={master.id}
              master={master}
              live={liveByUuid.get(master.uuid) ?? null}
              onOpen={() => setOpenMaster(master)}
            />
          ))}
        </div>
      )}

      <SpeedMasterDetailSheet
        open={currentOpenMaster != null}
        onOpenChange={(next) => !next && setOpenMaster(null)}
        projectId={projectIdNum}
        master={currentOpenMaster}
      />
    </Card>
  )
}

/**
 * One master. Runnable as well as editable — tap and click-to-type work here exactly as they
 * do on the ShowBar (same `useBpmDraft`), so the page is usable during a show rather
 * than only between them.
 */
function SpeedMasterRow({
  master,
  live,
  onOpen,
}: {
  master: SpeedMaster
  live: SpeedMasterLiveState | null
  onOpen: () => void
}) {
  // Fall back to the stored tempo only until the first live frame arrives; after that the
  // live value is the truth, and showing the stored one would be a stale readout.
  const bpm = live?.bpm ?? master.bpm
  const uuidForWrites = master.masterIndex === 1 ? null : master.uuid
  const { editing, draft, start, change, commit, onKeyDown } = useBpmDraft(
    master.uuid,
    (next) => setSpeedMasterBpm(uuidForWrites, next),
  )
  // Read the ratio off the persisted row rather than the live frame: this page joins the two by
  // uuid and the row is the one that exists before the first frame arrives. A follower's tempo
  // is master 1's business, so both writes go — same rule as the ShowBar tiles.
  const follow = followRatioOf(master)
  const lockedReason = follow
    ? followerTempoLockedReason(master.name, follow.num, follow.den)
    : null
  const usage = usageLabel(master.usage)

  return (
    <div className="flex items-center gap-3 rounded-md border bg-card p-3">
      <BeatIndicator
        master={{ uuid: uuidForWrites, index: master.masterIndex }}
        className="shrink-0"
      />

      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col items-start text-left"
      >
        <span className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-muted-foreground">
            M{master.masterIndex}
          </span>
          <span className="truncate font-medium">{master.name}</span>
          {master.masterIndex === 1 && (
            <Badge variant="secondary" className="text-[10px]">
              Global
            </Badge>
          )}
          {usage != null && (
            <Badge
              variant="outline"
              className="text-[10px]"
              title={`Busked ${usage.toLowerCase()} effects with no explicit master run on this one`}
            >
              {usage}
            </Badge>
          )}
          {/* A follower's provenance reads MANUAL (its tempo is written through, not tapped),
              so these two badges never collide. */}
          {follow != null && (
            <Badge variant="outline" className="text-[10px]" title={lockedReason ?? undefined}>
              {describeFollow(follow.num, follow.den)}
            </Badge>
          )}
          {live?.source === 'TAP' && (
            <Badge variant="outline" className="text-[10px]">
              tapped
            </Badge>
          )}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {master.notes?.trim() ||
            (master.referenceCount > 0
              ? `${master.referenceCount} reference${master.referenceCount === 1 ? '' : 's'}`
              : 'Nothing follows this master yet')}
        </span>
      </button>

      {editing ? (
        <input
          autoFocus
          inputMode="decimal"
          value={draft}
          onChange={(e) => change(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          aria-label={`Master ${master.masterIndex} BPM`}
          className="w-[6ch] shrink-0 border-b border-primary bg-transparent text-right font-mono text-lg font-bold tabular-nums outline-none"
        />
      ) : (
        <button
          type="button"
          disabled={lockedReason != null}
          onClick={() => start(bpm)}
          title={lockedReason ?? `Master ${master.masterIndex} — click to type a tempo`}
          className={cn(
            'w-[6ch] shrink-0 text-right font-mono text-lg font-bold tabular-nums transition-colors hover:text-primary disabled:hover:text-foreground',
            live == null && 'text-muted-foreground',
          )}
        >
          {formatBpm(bpm)}
        </button>
      )}

      {follow ? (
        <span
          title={lockedReason ?? undefined}
          aria-label={`Master ${master.masterIndex} follows Master 1 at ${follow.num}/${follow.den}`}
          className="flex h-8 shrink-0 items-center rounded-md border px-3 text-sm font-bold tabular-nums text-muted-foreground"
        >
          {formatFollowRatio(follow.num, follow.den)}
        </span>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => tapSpeedMaster(uuidForWrites)}
          aria-label={`Tap tempo for master ${master.masterIndex}`}
          className="shrink-0 font-bold tracking-[0.08em]"
        >
          TAP
        </Button>
      )}
    </div>
  )
}
