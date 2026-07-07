import { ChevronDown } from 'lucide-react'
import type { CueStackCueEntry } from '@/api/cueStacksApi'
import { CueCardBody, type ExpansionMode } from './CueCardBody'

export type CardKind = 'cur' | 'nxt'
export type { ExpansionMode }
export interface MobileExpansion {
  card: CardKind
  mode: ExpansionMode
}

interface RunMobileCueCardProps {
  kind: CardKind
  cue: CueStackCueEntry | null
  projectId: number
  /** Mutually-exclusive expansion across the two cards. null = both collapsed. */
  expansion: MobileExpansion | null
  onSetExpansion: (next: MobileExpansion | null) => void
  /** Counter for the Current card ("3 / 12"). */
  counter?: string | null
  /** Open the bottom-sheet picker (Next card "Change" button). */
  onChange?: () => void
  /** 0..1 fade progress when this is the Current card and the cue is fading in. */
  fadeProgress?: number | null
  /** Remaining ms in the fade-in. */
  fadeRemainMs?: number | null
  /** Prompt-book reading position for this cue, e.g. "top of p. 9". */
  location?: string | null
}

/**
 * Mobile cue card for "Now playing" (current) and "Up next". A thin wrapper over the
 * shared `CueCardBody`: maps the mutually-exclusive `MobileExpansion` model to the
 * body's per-card `mode`, and injects the current card's counter pill or the next
 * card's "Change" button as header-trailing chrome.
 */
export function RunMobileCueCard({
  kind,
  cue,
  projectId,
  expansion,
  onSetExpansion,
  counter,
  onChange,
  fadeProgress,
  fadeRemainMs,
  location,
}: RunMobileCueCardProps) {
  const mode = expansion?.card === kind ? expansion.mode : null
  // CueCardBody now always renders headerTrailing (so the book's chevron survives the
  // fade); preserve the current card's pre-extraction behaviour of hiding the counter
  // while the fade badge is showing.
  const isFading = kind === 'cur' && fadeProgress != null && fadeProgress < 1

  const headerTrailing =
    kind === 'cur'
      ? counter && !isFading
        ? (
            <span className="rounded-full border border-border bg-muted/30 px-2 py-px text-[9.5px] text-muted-foreground tracking-[0.08em]">
              {counter}
            </span>
          )
        : null
      : onChange
        ? (
            <button
              type="button"
              onClick={onChange}
              className="inline-flex items-center gap-1 rounded-full border border-blue-900/60 bg-blue-950/60 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-blue-300 active:scale-95"
            >
              Change
              <ChevronDown className="size-2.5" />
            </button>
          )
        : null

  return (
    <CueCardBody
      kind={kind}
      cue={cue}
      projectId={projectId}
      mode={mode}
      onModeChange={(next) => onSetExpansion(next == null ? null : { card: kind, mode: next })}
      location={location}
      headerTrailing={headerTrailing}
      fadeProgress={fadeProgress}
      fadeRemainMs={fadeRemainMs}
    />
  )
}
