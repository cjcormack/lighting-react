import { useMemo } from 'react'
import { AlertTriangle, CirclePlus, Circle, Download, Layers, RefreshCw, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { FAMILY_LABELS } from '@/lib/attributeFamily'
import { canClaimInSync, resolveProgrammerSource } from '@/lib/programmerSource'
import type { ProgrammerSource } from '@/lib/programmerSource'
import { includedCueId } from '@/lib/includedTarget'
import { useProgrammerSummaryQuery } from '@/store/programmer'
import { useActiveEffectsQuery } from '@/store/fixtureFx'
import { useProjectCueStackListQuery } from '@/store/cueStacks'
import { useLookListQuery } from '@/store/looks'
import { useIncludeBaseline } from './useIncludeBaseline'

const ZONE_LABEL = 'text-[9px] font-bold uppercase tracking-[0.1em]'

/**
 * What the programmer is holding, said out loud and permanently.
 *
 * Brief item 4: the included cue used to be named only inside the Update button's tooltip, so an
 * operator four minutes into a busk had no on-screen answer to "will Record overwrite Q4?". The
 * strip sits above the action bar because it is the **noun those verbs act on**, and it is present
 * in every state — *empty is a state, not an absence*, and "the programmer is empty, Include
 * something" answers a real question.
 *
 * `Update` lives here rather than in the action bar for the same reason: it is the one action that
 * writes to the thing this strip names, so it belongs beside it rather than among the verbs that
 * act on the rig.
 *
 * Two states the design drew are absent, and `lib/programmerSource.ts` says why: a real
 * "changed on another desk" conflict, and Detach. Neither is reachable without the backend, and
 * both would have had to be faked.
 */
export function ProgrammerSourceStrip({
  projectId,
  onUpdate,
  onRevert,
  onRecord,
}: {
  projectId: number
  onUpdate: () => void
  onRevert: () => void
  onRecord: () => void
}) {
  const { data: summary } = useProgrammerSummaryQuery()
  const { data: activeEffects } = useActiveEffectsQuery()
  const { data: stacks } = useProjectCueStackListQuery(projectId)
  const dirty = useIncludeBaseline()

  const target = summary?.lastIncluded ?? null
  const lookId = target?.kind === 'LOOK' ? target.lookId : null
  // Only to label the Look's families; skipped entirely when a cue (or nothing) is included.
  const { data: looks } = useLookListQuery({ projectId }, { skip: lookId == null })

  const cueId = includedCueId(target)
  const cueLocation = useMemo(() => {
    // `undefined` while the stack list is still in flight, too: an absent list is not evidence the
    // cue was deleted, and `resolveProgrammerSource` reads a `null` here as exactly that claim.
    if (cueId == null || stacks == null) return undefined
    for (const stack of stacks) {
      const index = stack.cues.findIndex((c) => c.id === cueId)
      if (index >= 0) {
        return { stackName: stack.name, position: { index: index + 1, total: stack.cues.length } }
      }
    }
    // Not `undefined`: an explicit null is what tells the resolver the cue has been DELETED, as
    // opposed to not having been looked up.
    return null
  }, [cueId, stacks])

  const lookFamilies = useMemo(() => {
    if (lookId == null) return undefined
    const families = looks?.find((l) => l.id === lookId)?.families
    if (!families?.length) return undefined
    return families.map((f) => FAMILY_LABELS[f].singular).join(', ')
  }, [lookId, looks])

  const source = resolveProgrammerSource({
    target,
    entryCount: summary?.entryCount ?? 0,
    programmerFxCount: activeEffects?.filter((e) => e.programmerOwned).length ?? 0,
    dirty,
    cueLocation,
    lookFamilies,
  })

  if (source.kind === 'empty') {
    return (
      <Strip tone="neutral">
        <CirclePlus className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          Programmer is empty. <span className="font-medium text-foreground">Include</span> a cue or
          a Look, or start busking.
        </span>
      </Strip>
    )
  }

  if (source.kind === 'busking') {
    return (
      <Strip tone="neutral">
        <span className={cn(ZONE_LABEL, 'shrink-0 text-muted-foreground')}>Busking</span>
        <span className="text-xs text-muted-foreground">
          No source — {source.valueCount} value{source.valueCount === 1 ? '' : 's'}, nothing to
          update
        </span>
        <span className="flex-1" />
        <Button size="sm" className="h-7" onClick={onRecord}>
          <Circle className="size-3 fill-current" />
          Record…
        </Button>
      </Strip>
    )
  }

  if (source.missing) {
    return (
      <Strip tone="warning">
        <AlertTriangle className="size-3.5 shrink-0 text-amber-400" />
        <span className="text-xs text-amber-200">
          The {source.kind === 'cue' ? 'cue' : 'Look'} you were editing has been deleted.
        </span>
        <span className="flex-1" />
        <Button size="sm" variant="outline" className="h-7" onClick={onRecord}>
          Record…
        </Button>
      </Strip>
    )
  }

  const inSync = canClaimInSync(source)
  const label = source.kind === 'cue' ? 'Update' : 'Update Look'

  return (
    <Strip tone="editing">
      <span className={cn(ZONE_LABEL, 'shrink-0 text-blue-300')}>Editing</span>
      {source.kind === 'look' ? (
        <Layers className="size-3.5 shrink-0 text-blue-300" />
      ) : (
        <Download className="size-3.5 shrink-0 text-blue-300" />
      )}
      {source.kind === 'cue' && source.number && (
        <span className="shrink-0 font-mono text-sm font-bold">{source.number}</span>
      )}
      {source.name && <span className="truncate text-sm font-medium">{source.name}</span>}
      {source.kind === 'look' && source.families && (
        <Badge variant="outline" className="shrink-0 text-[10px]">
          Look · {source.families}
        </Badge>
      )}
      {source.kind === 'cue' && <CueLocation source={source} />}

      <span className="flex-1" />

      <DirtyBadge dirty={source.dirty} inSync={inSync} />

      <Tooltip>
        <TooltipTrigger asChild>
          {/* Wrapped so a disabled button still shows its reason. */}
          <div className="shrink-0">
            <Button size="sm" className="h-7" disabled={inSync} onClick={onUpdate}>
              <Upload className="size-3" />
              {source.kind === 'cue' && source.number ? `${label} ${source.number}` : label}
            </Button>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {inSync
            ? 'Nothing has changed since Include'
            : source.dirty == null
              ? "This tab didn't see the Include, so it can't count your changes — Update writes whatever changed on the server."
              : 'Write your changes back'}
        </TooltipContent>
      </Tooltip>

      {!inSync && (
        <Button size="sm" variant="outline" className="h-7 shrink-0" onClick={onRevert}>
          <RefreshCw className="size-3" />
          Revert
        </Button>
      )}
    </Strip>
  )
}

/** "Act 1 · cue 4 of 14" — the reassurance that you are editing the cue you think you are. */
function CueLocation({ source }: { source: Extract<ProgrammerSource, { kind: 'cue' }> }) {
  const parts = [
    source.stackName,
    source.position ? `cue ${source.position.index} of ${source.position.total}` : null,
  ].filter(Boolean)
  if (parts.length === 0) return null
  return (
    <span className="hidden shrink-0 truncate text-xs text-blue-300/80 @[700px]:inline">
      {parts.join(' · ')}
    </span>
  )
}

/**
 * The change count — **or nothing at all**.
 *
 * `dirty == null` renders no badge rather than a reassuring one. See `canClaimInSync`: a tab that
 * did not watch the Include cannot tell, and "in sync" over unwritten work costs a cue.
 */
function DirtyBadge({ dirty, inSync }: { dirty: number | null; inSync: boolean }) {
  if (inSync) {
    return (
      <span className="shrink-0 rounded-full border border-green-900 bg-green-950/40 px-2 py-px text-[10px] font-medium text-green-400">
        in sync
      </span>
    )
  }
  if (dirty == null || dirty === 0) return null
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-amber-900 bg-amber-950/40 px-2 py-px text-[10px] font-medium text-amber-300">
      <span className="size-1.5 rounded-full bg-amber-400" />
      {dirty} change{dirty === 1 ? '' : 's'} not written back
    </span>
  )
}

function Strip({
  tone,
  children,
}: {
  tone: 'neutral' | 'editing' | 'warning'
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        '@container flex min-w-0 items-center gap-2 border-b px-4 py-1.5',
        tone === 'editing' && 'border-b-blue-900/70 bg-blue-950/30',
        tone === 'warning' && 'border-b-amber-800 bg-amber-950/40',
        tone === 'neutral' && 'bg-card/50',
      )}
    >
      {children}
    </div>
  )
}
