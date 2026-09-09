import { memo, useCallback, useState, type ReactNode } from 'react'
import { useParams } from 'react-router'
import {
  ArrowDownUp,
  AudioWaveform,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Hand,
  Layers,
  Palette,
  Plus,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useActiveEffectsQuery } from '@/store/fixtureFx'
import { useProgrammerLayersQuery } from '@/store/programmer'
import { FxSheet } from './FxSheet'
import {
  ProgrammerAddEffectSheet,
  useProgrammerAddEffect,
  type AddEffectOffer,
} from './ProgrammerAddEffect'
import { ProgrammerAddLayerSheet, type ProgrammerAddLayerKind } from './ProgrammerAddLayerSheet'
import { ProgrammerFxList } from './ProgrammerFxList'
import { ProgrammerLookStack } from './ProgrammerLookStack'
import { useProgrammerScope, useProgrammerScopeActions } from './ProgrammerScope'
import { useProgrammerSheets } from './ProgrammerSheets'
import { useLocalValueCount } from './useLocalFamilyCounts'
import { RailBodyFrame, RailStripFrame, useRailArm } from './ProgrammerWorkspace'

/** One label for every band of the rail: the busk view's `BuskLabel`, in a rail that has no icon room. */
const LABEL_CLASS =
  'inline-flex shrink-0 items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground'

type AddKind = ProgrammerAddLayerKind | 'effect'

/**
 * The layer stack and the running effects, side by side with the value grid rather than behind
 * tabs — the three readings of one live object, all on screen.
 *
 * **One list, two bands, since session 3 of the space plan.** It was two separately-headed
 * sections — the stack with its own LAYERS heading and Add, the FX band with its own heading and
 * `+ Effect` — stacked in a fixed 404px column. Now it is one scroller under one 36px header
 * (`LAYERS n · FX n` and the collapse chevron, level with row B) and over one footer
 * (`+ Look · + Template · + Effect`). The body runs top to bottom **top wins**: a
 * `VALUES · top wins` label, the **Local values** row — the operator's own entries, which beat
 * every layer, with `Make layer` on it because that is the row it promotes — the layers at the
 * dense density from strongest to weakest (the array reversed; see `LookStack`'s `dense`), the
 * amber boundary that says values beat effects whatever the order, and the effects. The rule the
 * old stack's paragraph stated is the label's two words and its hover.
 *
 * **The strip is drawn here too.** Collapsed — or narrow, where the rail is an overlay — the rail
 * is a 40px strip carrying the two counts as badges under their glyphs and one `+` that opens the
 * same three doors as the footer, so nothing is reachable only with the rail open. Which arm is
 * showing is `ProgrammerWorkspace`'s: it owns the width, the collapsed flag and the overlay flag,
 * and this component reads them through `useRailArm`. The frames are the workspace's as well;
 * this component decides what goes in them.
 *
 * **The two sheets are mounted here and not in the body**, because the body unmounts when the
 * rail collapses and the strip's `+` has to open them while it is gone. `useProgrammerAddEffect`
 * is called here for the same reason: its offer is handed to both doors and to the sheet, so the
 * footer button, the menu item and the sheet cannot disagree about whether an effect can land.
 * That hook subscribes to the desk selection, which a marquee changes many times a second, so
 * `RailBody` is memoised and the two lists inside it are too: a selection change re-renders this
 * component, the header and the two door rows, and stops there. The `Per-fixture FX` disclosure's
 * open flag lives here as well, for the plainer reason that the body unmounts with the rail and
 * a diagnostic that shut itself every time the rail was reopened would be a nuisance.
 *
 * **`FxSheet` stays a mount-on-demand disclosure at the foot of the body.** It builds the whole
 * fixture row model a second time, renders every row unvirtualized, and subscribes to
 * `useProgrammerRevision`, which fires on every programmer event — including each 30 Hz commit
 * tick from the grid beside it. Always-mounted would mean re-rendering a 200-row tree at 30 Hz
 * while the operator drags a fader. Behind one click it costs nothing until it is asked for, and
 * it is still the only place per-fixture suppression and programmer-ownership are visible.
 */
export function ProgrammerRail() {
  const { projectId: projectIdParam } = useParams()
  const projectId = Number(projectIdParam)
  const arm = useRailArm()
  const { data: layers } = useProgrammerLayersQuery()
  const { data: effects } = useActiveEffectsQuery()
  const layerCount = layers?.length ?? 0
  const fxCount = effects?.length ?? 0
  const [adding, setAdding] = useState<AddKind | null>(null)
  const [diagnosticOpen, setDiagnosticOpen] = useState(false)
  const addEffect = useProgrammerAddEffect()
  const closeAdd = useCallback(() => setAdding(null), [])

  return (
    <>
      {(!arm.collapsed || arm.overlayOpen) && (
        <RailBodyFrame>
          <RailHeader layerCount={layerCount} fxCount={fxCount} />
          <RailBody
            projectId={projectId}
            diagnosticOpen={diagnosticOpen}
            onDiagnosticOpenChange={setDiagnosticOpen}
          />
          <RailFooter onAdd={setAdding} addEffect={addEffect} />
        </RailBodyFrame>
      )}
      <RailStripFrame>
        <RailStrip
          layerCount={layerCount}
          fxCount={fxCount}
          onAdd={setAdding}
          addEffect={addEffect}
        />
      </RailStripFrame>
      <ProgrammerAddLayerSheet
        projectId={projectId}
        kind={adding === 'look' || adding === 'template' ? adding : null}
        onClose={closeAdd}
      />
      <ProgrammerAddEffectSheet open={adding === 'effect'} offer={addEffect} onClose={closeAdd} />
    </>
  )
}

function CountBadge({ count }: { count: number }) {
  return (
    <Badge variant="secondary" className="px-1 py-0 text-[9px] leading-[1.5] tabular-nums">
      {count}
    </Badge>
  )
}

/**
 * `LAYERS n · FX n` and the chevron that takes the rail away — 36px, level with row B.
 *
 * Two chevrons, one per arm, hidden by the same container query the frames use: the docked
 * rail's writes the collapsed preference, the overlay's only shuts the overlay. One button
 * deciding which to do would need the arm in JS, and the two flags stay honest by never being
 * written from the wrong arm (`RailArm`).
 */
function RailHeader({ layerCount, fxCount }: { layerCount: number; fxCount: number }) {
  const arm = useRailArm()
  return (
    <div className="flex h-9 shrink-0 items-center gap-2.5 border-b px-2.5">
      <span className={LABEL_CLASS} title={`${layerCount} layer${layerCount === 1 ? '' : 's'}`}>
        <Layers className="size-3" />
        Layers
        <CountBadge count={layerCount} />
      </span>
      <span
        className={cn(LABEL_CLASS, 'text-violet-400')}
        title={`${fxCount} effect${fxCount === 1 ? '' : 's'} running`}
      >
        <AudioWaveform className="size-3" />
        FX
        <CountBadge count={fxCount} />
      </span>
      <span className="flex-1" />
      <Button
        variant="ghost"
        size="icon"
        className="size-6 text-muted-foreground @max-[1200px]:hidden"
        aria-label="Collapse the rail"
        title="Collapse the rail to a strip"
        onClick={arm.collapse}
      >
        <ChevronRight className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 text-muted-foreground @min-[1200px]:hidden"
        aria-label="Close the rail"
        title="Close the rail"
        onClick={arm.closeOverlay}
      >
        <ChevronRight className="size-3.5" />
      </Button>
    </div>
  )
}

/**
 * The one scroller: values, the boundary, effects, and the diagnostic disclosure at the foot.
 *
 * Memoised because its parent re-renders on every selection change (see `ProgrammerRail`) and
 * nothing in here reads the selection through props — each row subscribes to what it needs.
 */
const RailBody = memo(function RailBody({
  projectId,
  diagnosticOpen,
  onDiagnosticOpenChange,
}: {
  projectId: number
  diagnosticOpen: boolean
  onDiagnosticOpenChange: (open: boolean) => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2.5 py-2">
      <div className="flex items-center gap-1.5 px-0.5">
        <span className={cn(LABEL_CLASS, 'text-primary')}>Values</span>
        {/* The precedence rule, in two words; the sentence the stack's paragraph used to spend a
            line on is its hover. Session 1's rule for every band of this page. */}
        <span
          className="text-[9.5px] text-muted-foreground"
          title="Later layers win, and the values you set yourself win over all of them — for every attribute, intensity included. Across cues, HTP still governs intensity. Record writes this stack into a cue as its layers."
        >
          top wins
        </span>
      </div>
      <LocalValuesRow />
      <ProgrammerLookStack />
      {/* Layer order does not govern the value/effect boundary: effects are Layer 3 and values
          Layer 4, so a value above beats an effect below whatever the rows say. Drawn as a band
          across the rail rather than a caption, because it is the one thing dragging cannot
          change; per-layer stomp is the escape hatch, on the row. */}
      <div className="-mx-2.5 mt-1 flex items-center gap-1.5 border-y border-amber-800/70 bg-amber-950/40 px-2.5 py-[5px]">
        <ArrowDownUp className="size-3 shrink-0 text-amber-300" />
        <span className={cn(LABEL_CLASS, 'tracking-[0.06em] text-amber-300')}>
          Values above beat effects below
        </span>
      </div>
      <div className="flex items-center gap-1.5 px-0.5 pt-0.5">
        <span className={cn(LABEL_CLASS, 'text-violet-400')}>Effects</span>
      </div>
      <ProgrammerFxList />
      <div className="mt-auto pt-2">
        <button
          type="button"
          onClick={() => onDiagnosticOpenChange(!diagnosticOpen)}
          aria-expanded={diagnosticOpen}
          className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
        >
          {diagnosticOpen ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
          Per-fixture FX
        </button>
        {/* Mounted only when open — see the component's doc comment for why. */}
        {diagnosticOpen && projectId > 0 && (
          <div className="pt-1">
            <FxSheet />
          </div>
        )}
      </div>
    </div>
  )
})

/**
 * The operator's own values, as the top row of the stack — because that is what they are: the
 * last layer, the one that beats every other, and the one Record takes.
 *
 * Painted in `--primary`, which on this page means exactly *you own this value* (space plan D4).
 * The name is the row's focus control, the way a layer row's name badge is: pressing it points the
 * grid at Local. `Make layer` lives here since session 3, moved off row B, because this row is
 * what it promotes; it is disabled rather than hidden with nothing to promote, since an affordance
 * that only appears once you already know to busk first teaches nobody.
 *
 * The row is on screen in every scope, so `Make layer` is reachable from Output and from a
 * focused layer, where row B's button was not (it returned null outside Local). The press
 * **points the grid at Local before opening the sheet**: promoting moves the Local entries into a
 * new layer and clears them, and a grid showing Output or a layer would have watched values it
 * was not displaying vanish. In Local it is the same one-step gesture it always was.
 */
function LocalValuesRow() {
  const count = useLocalValueCount()
  const scope = useProgrammerScope()
  const actions = useProgrammerScopeActions()
  const sheets = useProgrammerSheets()
  const focused = scope?.kind === 'local'
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md border border-primary/60 bg-primary/10 px-2 py-1.5 text-xs',
        focused && 'ring-1 ring-primary/60',
      )}
    >
      <Hand className="size-3.5 shrink-0 text-primary" />
      <button
        type="button"
        className="flex min-w-0 flex-1 flex-col text-left focus-visible:ring-1 focus-visible:ring-ring rounded"
        aria-pressed={focused}
        title={focused ? 'The grid is showing your values' : 'Show only the values you set'}
        onClick={() => actions?.setScope({ kind: 'local' })}
      >
        <span className="font-semibold">Local values</span>
        <span className="truncate text-[10px] text-primary/90">
          {count === 0 ? 'nothing yet' : `${count} value${count === 1 ? '' : 's'}`} · yours ·
          beats every layer
        </span>
      </button>
      <Button
        variant="outline"
        size="sm"
        className="h-[22px] shrink-0 px-1.5 text-[10px]"
        disabled={count === 0}
        onClick={() => {
          actions?.setScope({ kind: 'local' })
          sheets.openMakeLayer()
        }}
        title={
          count === 0
            ? 'Set some values first, then promote them into a shared look'
            : 'Save these values as a look and apply it here as a layer'
        }
      >
        <Layers className="size-3" />
        Make layer
      </Button>
    </div>
  )
}

/** The three doors, equal width. `+ Effect` says why when it cannot open. */
function RailFooter({
  onAdd,
  addEffect,
}: {
  onAdd: (kind: AddKind) => void
  addEffect: AddEffectOffer
}) {
  return (
    <div className="flex shrink-0 gap-1.5 border-t p-2">
      <Button
        variant="outline"
        size="sm"
        className="h-7 flex-1 px-1.5 text-[11px]"
        aria-label="Add a look layer"
        onClick={() => onAdd('look')}
      >
        <Plus className="size-3" />
        Look
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 flex-1 px-1.5 text-[11px]"
        aria-label="Add a template layer"
        onClick={() => onAdd('template')}
      >
        <Plus className="size-3" />
        Template
      </Button>
      {/* The trigger is a span around the button, not the button: `Button` carries
          `disabled:pointer-events-none`, so a disabled trigger is never hovered and the tooltip —
          whose whole job is to say *why* the door is shut — could never open in exactly the state
          it exists for. The span takes the hover; the button keeps `disabled` for the keyboard. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex flex-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-full px-1.5 text-[11px]"
              aria-label="Add an effect"
              disabled={addEffect.disabled}
              onClick={() => onAdd('effect')}
            >
              <Plus className="size-3" />
              Effect
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{addEffect.reason}</TooltipContent>
      </Tooltip>
    </div>
  )
}

/**
 * The 40px strip. Its chevron is two buttons, one per arm, like the header's: the docked arm's
 * expands, the narrow arm's toggles the overlay — the plan names the strip's chevron as a way to
 * close it as well as open it.
 */
function RailStrip({
  layerCount,
  fxCount,
  onAdd,
  addEffect,
}: {
  layerCount: number
  fxCount: number
  onAdd: (kind: AddKind) => void
  addEffect: AddEffectOffer
}) {
  const arm = useRailArm()
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-10 rounded-none border-b text-muted-foreground @max-[1200px]:hidden"
        aria-label="Expand the rail"
        title="Show the layers and effects"
        onClick={arm.expand}
      >
        <ChevronLeft className="size-3.5" />
      </Button>
      {/* One name and an `aria-expanded` state rather than a name that flips, so this and the
          overlay header's own "Close the rail" — both on screen while it is open — are not two
          controls announced by the same words. */}
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-10 rounded-none border-b text-muted-foreground @min-[1200px]:hidden"
        aria-label="Open the rail"
        aria-expanded={arm.overlayOpen}
        title={
          arm.overlayOpen ? 'Close the rail' : 'Show the layers and effects over the grid'
        }
        onClick={arm.overlayOpen ? arm.closeOverlay : arm.openOverlay}
      >
        {arm.overlayOpen ? (
          <ChevronRight className="size-3.5" />
        ) : (
          <ChevronLeft className="size-3.5" />
        )}
      </Button>
      <StripCount
        glyph={<Layers className="size-3.5" />}
        count={layerCount}
        title={`${layerCount} layer${layerCount === 1 ? '' : 's'}`}
      />
      <StripCount
        glyph={<AudioWaveform className="size-3.5" />}
        count={fxCount}
        title={`${fxCount} effect${fxCount === 1 ? '' : 's'} running`}
        className="text-violet-400"
      />
      <span className="flex-1" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-10 rounded-none text-muted-foreground"
            aria-label="Add a layer or an effect"
            title="Add a look, a template or an effect"
          >
            <Plus className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="left" align="end">
          <DropdownMenuItem onClick={() => onAdd('look')}>
            <Layers className="size-3.5" />
            Look
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAdd('template')}>
            <Palette className="size-3.5" />
            Template
          </DropdownMenuItem>
          {/* Disabled with the reason *written under it* rather than omitted: a menu that
              silently loses an entry teaches nobody why. Not a `title` — a disabled Radix item
              is `pointer-events-none`, so a native tooltip on it can never show. */}
          <DropdownMenuItem
            disabled={addEffect.disabled}
            onClick={() => onAdd('effect')}
            className="items-start"
          >
            <AudioWaveform className="mt-0.5 size-3.5" />
            <span className="flex max-w-[16rem] flex-col">
              <span>Effect</span>
              {addEffect.disabled && (
                <span className="text-[10px] leading-snug text-muted-foreground whitespace-normal">
                  {addEffect.reason}
                </span>
              )}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

function StripCount({
  glyph,
  count,
  title,
  className,
}: {
  glyph: ReactNode
  count: number
  title: string
  className?: string
}) {
  return (
    <span className={cn('flex flex-col items-center gap-0.5 py-2', className)} title={title}>
      {glyph}
      <CountBadge count={count} />
    </span>
  )
}
