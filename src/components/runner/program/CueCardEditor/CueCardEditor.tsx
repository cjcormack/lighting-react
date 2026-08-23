import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  GripVertical,
  Layers,
  ListChecks,
  Loader2,
  Play,
  Sliders,
  Trash2,
  Zap,
} from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useNarrowContainer } from '@/hooks/useNarrowContainer'
import {
  useProjectCueQuery,
  useDeleteProjectCueMutation,
  usePatchProjectCueMutation,
} from '@/store/cues'
import { InlineEditField } from '@/components/InlineEditField'
import {
  EditorContextProvider,
  beginCueEditSession,
  endCueEditSession,
  setCueEditMode as sendSetCueEditMode,
} from '@/components/lighting-editor/EditorContext'
import type { CueEditMode } from '@/api/cueEditWsApi'
import type { Cue, CueTarget } from '@/api/cuesApi'
import type { CueStackCueEntry } from '@/api/cueStacksApi'
import {
  formatFadeCurve,
  formatFadeDuration,
  parseFadeDuration,
} from '@/lib/cueUtils'
import { AUTO_CUE_NUMBER_CLASS, cueNumberCellWidth } from '@/lib/cueNumber'
import { TruncateStart } from '@/components/TruncateStart'
import { SaveStatusIndicator } from '@/components/SaveStatusIndicator'
import { TargetsPane } from './TargetsPane'
import { CuePropsPane } from './CuePropsPane'
import { LayersPane, type LayersMode } from './LayersPane'
import { collectCueTargets } from './targetUtils'

export type { LayersMode }

const LIVE_CTX = { kind: 'live' as const }

interface CueCardEditorProps {
  cue: CueStackCueEntry
  projectId: number
  expanded: boolean
  onToggleExpanded: () => void
  isActive?: boolean
  isStandby?: boolean
  layersMode: LayersMode
  onDuplicate?: (cue: Cue) => void
  /** Record the programmer into this cue — opens the Record sheet targeting it. */
  onRecordInto?: (cueId: number) => void
  /** Load this cue into the programmer to edit it on stage. */
  onIncludeCue?: (cueId: number) => void
  includePending?: boolean
  /** Stack header sets this — width threshold (px) below which the body uses tabs. */
  tabsBreakpoint?: number
}

/**
 * Inline-expanding cue card. The collapsed row is the cue summary (Q# · palette
 * · name · target chips · fade); clicking expands the card to a 3-pane editor
 * (Targets · Properties · Layers). Below `tabsBreakpoint` (default 1000px of
 * card width) the panes collapse to a tab bar with one active pane.
 *
 * Each expanded card opens its own `cueEdit` WS session so live property edits
 * route through cueEdit.* and persist to the cue. Edits auto-save (PATCH).
 */
export function CueCardEditor({
  cue,
  projectId,
  expanded,
  onToggleExpanded,
  isActive = false,
  isStandby = false,
  layersMode,
  onDuplicate,
  onRecordInto,
  onIncludeCue,
  includePending = false,
  tabsBreakpoint = 1000,
}: CueCardEditorProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: cue.id })

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : undefined,
  }

  const [bodyRef, narrow] = useNarrowContainer(tabsBreakpoint)
  const [activeTab, setActiveTab] = useState<'targets' | 'props' | 'layers'>('layers')

  const [editMode, setEditMode] = useState<CueEditMode>('live')

  const { data: fullCue, isFetching } = useProjectCueQuery(
    { projectId, cueId: cue.id },
    { skip: !expanded },
  )
  const [deleteCue] = useDeleteProjectCueMutation()
  const [patchCue] = usePatchProjectCueMutation()

  // Sticky placeholder so a PATCH-driven refetch doesn't flash an empty body.
  // Cleared on cue-id change so a recycled component slot doesn't show a stale
  // prior cue for one render.
  const lastCueRef = useRef<Cue | null>(null)
  const lastCueIdRef = useRef<number>(cue.id)
  if (lastCueIdRef.current !== cue.id) {
    lastCueRef.current = null
    lastCueIdRef.current = cue.id
  }
  if (fullCue) lastCueRef.current = fullCue
  const cueData = fullCue ?? lastCueRef.current

  const sessionRef = useRef<number | null>(null)
  useEffect(() => {
    if (!expanded) {
      if (sessionRef.current != null) {
        endCueEditSession(sessionRef.current)
        sessionRef.current = null
      }
      return
    }
    if (sessionRef.current === cue.id) return
    if (sessionRef.current != null) endCueEditSession(sessionRef.current)
    beginCueEditSession(cue.id, editMode)
    sessionRef.current = cue.id
    return () => {
      if (sessionRef.current != null) {
        endCueEditSession(sessionRef.current)
        sessionRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, cue.id])

  const toggleEditMode = () => {
    const next: CueEditMode = editMode === 'live' ? 'blind' : 'live'
    setEditMode(next)
    if (sessionRef.current === cue.id) sendSetCueEditMode(cue.id, next)
  }

  const editorContextValue = useMemo(
    () =>
      expanded && cueData
        ? ({ kind: 'cue' as const, id: cueData.id, mode: editMode })
        : LIVE_CTX,
    [expanded, cueData, editMode],
  )

  const targets: CueTarget[] = useMemo(
    () => (cueData ? collectCueTargets(cueData) : []),
    [cueData],
  )
  const targetCount = targets.length
  const layersCount =
    (cueData?.propertyAssignments.length ?? 0) +
    (cueData?.adHocEffects.length ?? 0) +
    (cueData?.layers.length ?? 0)

  // Inline edits from the collapsed row. Same PATCH-on-commit contract as the expanded
  // card's Properties pane, so the two stay consistent — every field auto-saves.
  const commitName = (next: string) => {
    const trimmed = next.trim()
    if (trimmed === '') return false
    if (trimmed !== cue.name) patchCue({ projectId, cueId: cue.id, name: trimmed })
  }

  const commitCueNumber = (next: string) => {
    const trimmed = next.trim() || null
    if (trimmed !== (cue.cueNumber ?? null)) {
      patchCue({ projectId, cueId: cue.id, cueNumber: trimmed })
    }
  }

  const commitFade = (next: string) => {
    const parsed = parseFadeDuration(next)
    if (parsed === undefined) return false
    if (parsed !== (cue.fadeDurationMs ?? null)) {
      patchCue({ projectId, cueId: cue.id, fadeDurationMs: parsed })
    }
  }

  const fadeCurveLabel =
    cue.fadeDurationMs != null && cue.fadeDurationMs > 0 ? formatFadeCurve(cue.fadeCurve) : ''

  return (
    <div ref={setNodeRef} style={sortableStyle} {...attributes} data-cue-row={cue.id}>
      <div
        className={cn(
          // `@container`: the header's columns below query THIS box, which is also what `bodyRef`
          // measures for `tabsBreakpoint`. They used to be viewport `max-[…]:` against a
          // container-measured body, and the two disagree by exactly the sidebar width.
          '@container rounded-lg border bg-muted overflow-hidden transition-colors mx-2 my-1',
          isActive && 'border-green-500/70 shadow-[0_0_0_1px_rgba(34,197,94,0.3)]',
          isStandby && !isActive && 'border-blue-500/60',
          expanded && !isActive && !isStandby && 'border-primary/40',
        )}
      >
        <div
          className={cn(
            'grid items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors',
            // The Q# track is `auto`, sized by the fixed-width cell inside it — see
            // `cueNumberCellWidth`. Every row in a stack resolves the same width, so the column
            // still lines up, but a stack of "Q1"–"Q40" no longer reserves room it never uses.
            'grid-cols-[16px_auto_minmax(0,80px)_minmax(0,1fr)_auto_auto_18px]',
            '@max-[800px]:grid-cols-[16px_auto_minmax(0,1fr)_auto_18px] @max-[800px]:gap-2',
          )}
          onClick={onToggleExpanded}
        >
          <div
            className="flex items-center justify-center text-muted-foreground hover:text-foreground cursor-grab"
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="size-4" />
          </div>

          <div
            className="font-mono text-sm font-semibold flex items-center gap-1.5 min-w-0"
            // Play icon (12px) + gap (6px) + the inline field's border/padding (6px).
            style={cueNumberCellWidth('1.5rem')}
          >
            {isActive && (
              <Play
                className="size-3 fill-green-400 text-green-400 shrink-0"
                aria-label="Live"
              />
            )}
            <InlineEditField
              value={cue.cueNumber ?? ''}
              // Clipped at the START: the tail is what tells "QS1-3.1" from "QS1-3.2", so it is
              // the end worth keeping.
              formatDisplay={(v) => <TruncateStart text={v ? `Q${v}` : '—'} />}
              onCommit={commitCueNumber}
              ariaLabel="cue number"
              placeholder="14A"
              title={
                cue.cueNumberAuto
                  ? 'Auto-numbered from position — click to set an explicit cue number'
                  : 'Click to edit the cue number'
              }
              // Wraps the number rather than filling the cell, so only the text itself opens the
              // editor; the rest of the cell belongs to the row and expands the cue.
              className={cn(
                'min-w-0 max-w-full px-0.5',
                cue.cueNumberAuto && AUTO_CUE_NUMBER_CLASS,
              )}
            />
          </div>

          <div className="h-5 rounded overflow-hidden flex @max-[800px]:hidden">
            <PaletteBar palette={cueData?.palette ?? []} />
          </div>

          <InlineEditField
            value={cue.name}
            onCommit={commitName}
            ariaLabel="cue name"
            title="Click to rename"
            // `justify-self-start` keeps the field the width of the name it holds. Left to
            // stretch (the grid default) it would cover the whole 1fr column, so clicking the
            // empty space beside a short cue name opened the editor instead of expanding the cue.
            className={cn(
              'justify-self-start min-w-0 max-w-full truncate text-sm',
              isActive ? 'text-green-300 font-semibold' : isStandby ? 'text-blue-300 font-semibold' : 'font-medium',
            )}
          />

          <div className="flex items-center gap-1 flex-nowrap @max-[1000px]:hidden">
            {targets.slice(0, 4).map((t) => (
              <TargetChip key={`${t.type}:${t.key}`} target={t} />
            ))}
            {targetCount > 4 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                +{targetCount - 4}
              </Badge>
            )}
            {(cueData?.adHocEffects.length ?? 0) > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-500 bg-amber-500/10"
              >
                {cueData!.adHocEffects.length} FX
              </Badge>
            )}
          </div>

          <div className="flex flex-col items-end font-mono text-xs gap-0 leading-tight shrink-0">
            <span className="flex items-center gap-1 text-foreground">
              <InlineEditField
                value={formatFadeDuration(cue.fadeDurationMs)}
                formatDisplay={(v) => v || 'SNAP'}
                onCommit={commitFade}
                ariaLabel="fade duration"
                placeholder="2s"
                title="Fade duration — e.g. 2s, 500ms (a bare number is seconds)"
                className="w-14 text-right"
              />
              {fadeCurveLabel && (
                <span className="text-muted-foreground">{fadeCurveLabel}</span>
              )}
            </span>
            {cue.autoAdvance && (
              <span className="text-[9px] text-blue-500 uppercase tracking-wide">
                auto
              </span>
            )}
          </div>

          <ChevronRight
            className={cn(
              'size-4 text-muted-foreground transition-transform',
              expanded && 'rotate-90',
            )}
          />
        </div>

        {expanded && (
          <EditorContextProvider value={editorContextValue}>
            <div ref={bodyRef} className="border-t bg-background">
              {!cueData ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  {isFetching ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <span className="text-sm">Loading cue…</span>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/20">
                    {/* Scoped to this cue: the show-wide pill in the header reports any write in
                        the project, which is no use when you want to know that the field you
                        just left actually landed. */}
                    <SaveStatusIndicator cueId={cue.id} className="justify-start" />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={toggleEditMode}
                      className={cn(
                        'h-7 gap-1.5 text-xs',
                        editMode === 'live'
                          ? 'border-primary text-primary'
                          : 'border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/30',
                      )}
                      // "Preview edit", not "Blind": the programmer has its own Blind gate
                      // (which excludes it from the stage merge) and the two now coexist in
                      // the same session. Same word, different mechanism — so this one gets
                      // a different name.
                      title={
                        editMode === 'live'
                          ? 'Live — edits apply to the stage'
                          : 'Preview edit — edits persist to the cue only; stage untouched'
                      }
                    >
                      {editMode === 'live' ? (
                        <>
                          <Eye className="size-3.5" />
                          Live
                        </>
                      ) : (
                        <>
                          <EyeOff className="size-3.5" />
                          Preview edit
                        </>
                      )}
                    </Button>
                  </div>

                  {narrow && (
                    <div className="flex items-stretch border-b bg-muted/20 px-1">
                      <TabButton
                        active={activeTab === 'targets'}
                        onClick={() => setActiveTab('targets')}
                        icon={<Layers className="size-3.5" />}
                        label="Targets"
                        count={targetCount}
                      />
                      <TabButton
                        active={activeTab === 'props'}
                        onClick={() => setActiveTab('props')}
                        icon={<Sliders className="size-3.5" />}
                        label="Properties"
                      />
                      <TabButton
                        active={activeTab === 'layers'}
                        onClick={() => setActiveTab('layers')}
                        icon={<ListChecks className="size-3.5" />}
                        label="Layers"
                        count={layersCount}
                      />
                    </div>
                  )}

                  <div
                    className={cn(
                      narrow
                        ? 'block'
                        : 'grid grid-cols-3 divide-x',
                      'min-h-[360px] max-h-[min(720px,calc(100vh-12rem))]',
                    )}
                  >
                    <PaneShell
                      title="Targets"
                      count={targetCount}
                      icon={<Layers className="size-3.5" />}
                      active={!narrow || activeTab === 'targets'}
                      hideTitleInTabs={narrow}
                    >
                      <TargetsPane
                        cue={cueData}
                        projectId={projectId}
                        targets={targets}
                      />
                    </PaneShell>

                    <PaneShell
                      title="Cue properties"
                      icon={<Sliders className="size-3.5" />}
                      active={!narrow || activeTab === 'props'}
                      hideTitleInTabs={narrow}
                    >
                      <CuePropsPane cue={cueData} projectId={projectId} />
                    </PaneShell>

                    <PaneShell
                      title="Layer 2 + 3 — what plays"
                      count={layersCount}
                      icon={<ListChecks className="size-3.5" />}
                      active={!narrow || activeTab === 'layers'}
                      hideTitleInTabs={narrow}
                    >
                      <LayersPane
                        cue={cueData}
                        projectId={projectId}
                        mode={layersMode}
                        targets={targets}
                      />
                    </PaneShell>
                  </div>

                  <div className="flex items-center gap-2 px-3 py-2 border-t bg-muted/20">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive gap-1"
                      onClick={() => {
                        deleteCue({ projectId, cueId: cue.id })
                      }}
                    >
                      <Trash2 className="size-3.5" />
                      Remove
                    </Button>
                    {onDuplicate && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => onDuplicate(cueData)}
                      >
                        <Copy className="size-3.5" />
                        Duplicate
                      </Button>
                    )}
                    {/* The programmer loop, from the cue you're already looking at. Include
                        loads this cue into the programmer to edit on stage; Record writes the
                        programmer back. Together they replace the old "Grab live" button —
                        capturing the whole stage is now one Record source among several,
                        rather than the only (and lossiest) way in. */}
                    {onIncludeCue && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => onIncludeCue(cue.id)}
                        disabled={includePending}
                      >
                        {includePending ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Download className="size-3.5" />
                        )}
                        Include
                      </Button>
                    )}
                    {onRecordInto && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => onRecordInto(cue.id)}
                      >
                        <Zap className="size-3.5" />
                        Record
                      </Button>
                    )}
                    {/* No per-cue "Make hard" any more: the route is retired along with
                        value-level references, and "flatten this layer into local rows" is the
                        gesture that replaces it. It arrives with the programmer rewrite; until
                        then the programmer-wide Make hard in the programmer toolbar is the only
                        way out of a reference. */}
                  </div>
                </>
              )}
            </div>
          </EditorContextProvider>
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px',
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {label}
      {count != null && count > 0 && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-0.5">
          {count}
        </Badge>
      )}
    </button>
  )
}

function PaneShell({
  title,
  count,
  icon,
  active,
  hideTitleInTabs,
  children,
}: {
  title: string
  count?: number
  icon?: React.ReactNode
  active: boolean
  hideTitleInTabs?: boolean
  children: React.ReactNode
}) {
  if (!active) return null
  return (
    <div className="flex flex-col min-h-0 overflow-hidden">
      {!hideTitleInTabs && (
        <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-muted/10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10">
          {icon}
          <span>{title}</span>
          {count != null && count > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
              {count}
            </Badge>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3">{children}</div>
    </div>
  )
}

function PaletteBar({ palette }: { palette: string[] }) {
  if (palette.length === 0) {
    return <div className="w-12 h-full bg-muted/30" />
  }
  return (
    <div className="flex h-full w-20">
      {palette.slice(0, 6).map((c, i) => (
        <span key={i} className="flex-1 min-w-[4px]" style={{ background: c }} />
      ))}
    </div>
  )
}

function TargetChip({ target }: { target: CueTarget }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] px-1.5 py-0 gap-1 max-w-[120px]',
        target.type === 'fixture'
          ? 'border-amber-500/40 text-amber-500 bg-amber-500/10'
          : 'border-blue-500/40 text-blue-300 bg-blue-500/10',
      )}
    >
      <span className="truncate">{target.key}</span>
    </Badge>
  )
}
