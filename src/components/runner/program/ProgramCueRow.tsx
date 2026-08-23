import type { CueStackCueEntry } from '@/api/cueStacksApi'
import type { Cue } from '@/api/cuesApi'
import { CueCardEditor } from './CueCardEditor/CueCardEditor'

interface ProgramCueRowProps {
  cue: CueStackCueEntry
  projectId: number
  expanded: boolean
  onToggleExpanded: () => void
  /** Cue is currently on stage — rendered with the green "live" accent. */
  isActive?: boolean
  /** Cue will fire on the next GO — rendered with the blue "next" accent. */
  isStandby?: boolean
  /** Open Duplicate flow with the freshly fetched full cue. */
  onDuplicate?: (cue: Cue) => void
  /** Record the programmer into this cue — opens the Record sheet targeting it. */
  onRecordInto?: (cueId: number) => void
  /** Load this cue into the programmer to edit it on stage. */
  onIncludeCue?: (cueId: number) => void
  includePending?: boolean
}

/** Thin wrapper around `CueCardEditor` — kept so `StackDetail` doesn't have to
 *  reach across the whole `CueCardEditor` directory tree. */
export function ProgramCueRow(props: ProgramCueRowProps) {
  return <CueCardEditor {...props} />
}
