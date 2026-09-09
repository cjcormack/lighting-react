import { useMemo } from 'react'
import { AlertTriangle, CirclePlus, Circle, Download, Layers, RefreshCw, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { formatFamilyList } from '@/lib/attributeFamily'
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
 * The empty state's one sentence, split so the visible copy can bold `Include` without the `title`
 * becoming a second hand-typed copy of it. Its three sibling states each extract a plain `const`
 * for the same reason; this one needs the split because its middle word is a `<span>`.
 */
const EMPTY_PREFIX = 'Programmer is empty. '
const EMPTY_SUFFIX = ' a cue or a Look, or start busking.'
const EMPTY_SENTENCE = `${EMPTY_PREFIX}Include${EMPTY_SUFFIX}`

/**
 * What the programmer is holding, said out loud and permanently — **the left half of row A**.
 *
 * Brief item 4: the included cue used to be named only inside the Update button's tooltip, so an
 * operator four minutes into a busk had no on-screen answer to "will Record overwrite Q4?". It is
 * present in every state — *empty is a state, not an absence*, and "the programmer is empty,
 * Include something" answers a real question.
 *
 * `Update` and `Revert` live here rather than in the action bar for the same reason: they are the
 * two actions whose subject is the thing this names, so they belong *inside* the box rather than
 * among the verbs that act on the rig.
 *
 * **It was a full-width band of its own until the space plan's session 1**, sitting above a
 * second full-width band of verbs. Two bands each spending a line on one sentence is 101px of an
 * 900px screen, and the grid below them is the page. So the strip is now a bordered 32px box that
 * `flex-1`s across the left of row A and truncates its *name* before its badges — the badge is the
 * part that changes, the name is the part you can usually still guess. Nothing it said was
 * deleted: the location line and the long "3 changes not written back" wording appear at
 * `@[1100px]` and ride the *text's* `title` below that — never the box's, for the reason beside
 * `boxTitle` — `Update Q4` shortens to `Update` below
 * `@[800px]`, and Revert becomes its icon below `@[1100px]` with the word on its `aria-label`.
 *
 * **Below `@[600px]` it is the phone's arm** (space plan D8, session 4): the `Editing` label and
 * the cue/Look glyph go, and every verb here is its icon. What is left is `Q4 · name · badge`,
 * which is the shortest thing that still answers "will Record overwrite Q4?" — the question the
 * whole box exists for. The two that went are the two that say the *same* thing twice: the label
 * is a word for a state the blue rim already draws, and the glyph is a picture of the `Q4` beside
 * it. Both are still on the `title` the name carries, which is where every sentence this plan
 * moved went.
 *
 * The container queried is **row A's**, declared by the wrapper in `ProgrammerPage` — this
 * component must not declare one of its own, or every query here would measure the box rather
 * than the row it has to share (`ProgrammerWorkspace`'s doc comment has the long version of that
 * bug). In the short-height arm row A does not exist and this box leads row B instead, where
 * `ProgrammerGrid` wraps the pair in an `@container` of **its own** — so these queries measure the
 * ~380px the folded row's flex gives the pair, not the ~750px grid column around them, and this
 * box is in its icon arm on an 852×393 landscape phone. That is one step narrower than
 * `PhoneLandscape` draws, and it is measured rather than assumed on purpose: the artboard's action
 * bar is ~155px against this one's ~230, so a container the width of the whole row would have
 * promised `Editing` and `Update` room that this rig's verbs have already taken.
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
    return formatFamilyList(families)
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
        <span className="truncate text-xs text-muted-foreground" title={EMPTY_SENTENCE}>
          {EMPTY_PREFIX}
          <span className="font-medium text-foreground">Include</span>
          {EMPTY_SUFFIX}
        </span>
      </Strip>
    )
  }

  if (source.kind === 'busking') {
    const busking = `No source — ${source.valueCount} value${
      source.valueCount === 1 ? '' : 's'
    }, nothing to update`
    return (
      <Strip tone="neutral">
        {/* The label survives the phone's arm where `Editing` does not, and the SENTENCE is what
            goes instead. They are not the same trade: `Editing` is a word for a state the blue rim
            and the `Q4` beside it already draw, while `Busking` is the only thing in this arm of
            the box that names the state at all — and the sentence beside it, at the 100px the box
            has left once the verbs have theirs, truncated to `No so…`. The count it carries is on
            the rail's Local values row and in the programmer tile; the whole sentence is on the
            label's `title`, which is where this plan puts everything it moves. */}
        <span
          className={cn(ZONE_LABEL, 'shrink-0 text-muted-foreground')}
          title={busking}
        >
          Busking
        </span>
        <span className="hidden truncate text-xs text-muted-foreground @[600px]:inline">
          {busking}
        </span>
        <span className="flex-1" />
        <RecordButton onRecord={onRecord} />
      </Strip>
    )
  }

  if (source.missing) {
    const gone = `The ${source.kind === 'cue' ? 'cue' : 'Look'} you were editing has been deleted.`
    return (
      <Strip tone="warning">
        <AlertTriangle className="size-3.5 shrink-0 text-amber-400" />
        <span className="truncate text-xs text-amber-200" title={gone}>
          {gone}
        </span>
        <span className="flex-1" />
        <RecordButton onRecord={onRecord} variant="outline" />
      </Strip>
    )
  }

  const inSync = canClaimInSync(source)
  const label = source.kind === 'cue' ? 'Update' : 'Update Look'
  // The whole state as one sentence, for the widths where the location line is hidden below
  // `@[1100px]`: hover is where it went, so it has to actually be there.
  //
  // It goes on the *text* — the `Editing` label and the name — and never on the box, and that is
  // the difference between it being available and it being a bug. A browser shows an ancestor's
  // native `title` for any descendant that has none, so a `title` on the box would have been
  // inherited by the Update button, which is already inside a Radix `Tooltip`: two tooltip surfaces
  // answering one hover.
  const boxTitle = [
    'Editing',
    source.kind === 'cue' ? source.number : null,
    source.name,
    source.kind === 'cue' ? cueLocationText(source) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Strip tone="editing">
      <span
        className={cn(ZONE_LABEL, 'hidden shrink-0 text-blue-300 @[600px]:inline')}
        title={boxTitle}
      >
        Editing
      </span>
      {source.kind === 'look' ? (
        <Layers className="hidden size-3.5 shrink-0 text-blue-300 @[600px]:block" />
      ) : (
        <Download className="hidden size-3.5 shrink-0 text-blue-300 @[600px]:block" />
      )}
      {source.kind === 'cue' && source.number && (
        <span className="shrink-0 font-mono text-sm font-bold">{source.number}</span>
      )}
      {source.name && (
        <span className="truncate text-sm font-medium" title={boxTitle}>
          {source.name}
        </span>
      )}
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
            <Button
              size="sm"
              className="h-7 @max-[600px]:w-7 @max-[600px]:px-0"
              disabled={inSync}
              onClick={onUpdate}
              // The full label whatever the width: below `@[800px]` the cue number is dropped from
              // the *visible* text and this is the only thing still carrying it.
              aria-label={
                source.kind === 'cue' && source.number ? `${label} ${source.number}` : label
              }
            >
              <Upload className="size-3" />
              <span className="hidden @[600px]:inline">{label}</span>
              {source.kind === 'cue' && source.number && (
                <span className="hidden @[800px]:inline">{source.number}</span>
              )}
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
        <Button
          size="sm"
          variant="outline"
          // Icon-only below `@[1100px]`: the word rides the `aria-label`, which is also what a
          // screen reader gets at every width, so nothing is lost by the shrink.
          className="h-7 shrink-0 @max-[1100px]:w-7 @max-[1100px]:px-0"
          aria-label="Revert"
          title="Throw away the busk and Include this again"
          onClick={onRevert}
        >
          <RefreshCw className="size-3" />
          <span className="hidden @[1100px]:inline">Revert</span>
        </Button>
      )}
    </Strip>
  )
}

/**
 * The box's own Record, for the two states that have nothing to Update.
 *
 * One component rather than a copy per state, because what the two share is the part that has to
 * stay in step: below `@[600px]` it is a 28px square with the word on its `aria-label`, which is
 * the same shrink `Update` makes two states along. Only the tone differs — `busking` is a primary
 * button because Record is the thing to do next; the deleted-source state offers it in outline,
 * beside a warning that is the more important half of that row.
 *
 * The **glyph** is the one thing the outline arm draws differently: with `Record…` shown it has a
 * word to be recognised by, so the dot would only add ink beside an amber warning triangle — but
 * once the word goes, a button with nothing in it is not a button. So it appears exactly where
 * the word disappears.
 */
function RecordButton({
  onRecord,
  variant,
}: {
  onRecord: () => void
  variant?: 'outline'
}) {
  return (
    <Button
      size="sm"
      variant={variant}
      className="h-7 shrink-0 @max-[600px]:w-7 @max-[600px]:px-0"
      aria-label="Record…"
      onClick={onRecord}
    >
      <Circle
        className={cn('size-3 fill-current', variant === 'outline' && 'hidden @max-[600px]:block')}
      />
      <span className="hidden @[600px]:inline">Record…</span>
    </Button>
  )
}

/** "Act 1 · cue 4 of 14" — the reassurance that you are editing the cue you think you are. */
function cueLocationText(source: Extract<ProgrammerSource, { kind: 'cue' }>): string | null {
  const parts = [
    source.stackName,
    source.position ? `cue ${source.position.index} of ${source.position.total}` : null,
  ].filter(Boolean)
  return parts.length === 0 ? null : parts.join(' · ')
}

/**
 * The location, visible only at `@[1100px]`.
 *
 * It was `@[700px]` against the strip's own container; row A shares its width with every verb on
 * the page now, so the threshold is the artboard's — and below it the same text is on the box's
 * `title`, which is where the plan says the sentences go rather than away.
 */
function CueLocation({ source }: { source: Extract<ProgrammerSource, { kind: 'cue' }> }) {
  const text = cueLocationText(source)
  if (text == null) return null
  return (
    <span className="hidden shrink-0 truncate text-xs text-blue-300/80 @[1100px]:inline">
      {text}
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
  const plural = dirty === 1 ? '' : 's'
  return (
    <span
      // The long wording is the artboard's, and it only fits at `@[1100px]`; the short form keeps
      // the number, which is the part that changes, and the `title` keeps the sentence.
      title={`${dirty} change${plural} not written back`}
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-amber-900 bg-amber-950/40 px-2 py-px text-[10px] font-medium text-amber-300"
    >
      <span className="size-1.5 rounded-full bg-amber-400" />
      {dirty} change{plural}
      <span className="hidden @[1100px]:inline">not written back</span>
    </span>
  )
}

/**
 * The box itself: a bordered 32px control that takes the left of row A.
 *
 * It takes **no `title`**, on purpose — see the note beside `boxTitle` above. Each state puts its
 * hover text on the span it belongs to.
 *
 * It was a full-width band with a bottom border. Session 1 makes it a peer of the verbs beside it,
 * so the tone that used to wash a whole row now rims a box — and `flex-1 overflow-hidden` with
 * `truncate` on the name is what lets the badges and the two buttons keep their width when the
 * name is long, which is the priority the plan sets ("truncates its name before its badges").
 *
 * No `@container` here: row A declares it, and this box is one of the things being measured.
 */
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
        'flex h-8 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-md border px-2.5',
        tone === 'editing' && 'border-blue-900/70 bg-blue-950/30',
        tone === 'warning' && 'border-amber-800 bg-amber-950/40',
        tone === 'neutral' && 'bg-card/50',
      )}
    >
      {children}
    </div>
  )
}
