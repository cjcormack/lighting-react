import type { CueStackCueEntry } from '@/api/cueStacksApi'
import type { Cue } from '@/api/cuesApi'
import {
  CueCardEditor,
  type LayersMode,
} from './CueCardEditor/CueCardEditor'

interface ProgramCueRowProps {
  cue: CueStackCueEntry
  projectId: number
  expanded: boolean
  onToggleExpanded: () => void
  /** Cue is currently on stage — rendered with the green "live" accent. */
  isActive?: boolean
  /** Cue will fire on the next GO — rendered with the blue "next" accent. */
  isStandby?: boolean
  /** Layers pane arrangement (passed down from the stack header). */
  layersMode: LayersMode
  /** Open Duplicate flow with the freshly fetched full cue. */
  onDuplicate?: (cue: Cue) => void
  /** Open Grab-live confirmation. */
  onSnapshotFromLive?: (cueId: number) => Promise<void> | void
  snapshotPending?: boolean
}

/** Thin wrapper around `CueCardEditor` — kept so `StackDetail` doesn't have to
 *  reach across the whole `CueCardEditor` directory tree. */
export function ProgramCueRow(props: ProgramCueRowProps) {
  return <CueCardEditor {...props} />
}
