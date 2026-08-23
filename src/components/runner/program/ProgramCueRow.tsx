import type { ComponentProps } from 'react'
import { CueCardEditor } from './CueCardEditor/CueCardEditor'

/**
 * Thin wrapper around `CueCardEditor` — kept so `StackDetail` doesn't have to reach across the
 * whole `CueCardEditor` directory tree.
 *
 * Its props are *derived* rather than re-declared. They used to be a hand-copied interface, which
 * is a second declaration of one contract: session 2b added six props to the row and every one of
 * them would have had to be typed here too, with a silent drop for any that wasn't.
 */
export type ProgramCueRowProps = ComponentProps<typeof CueCardEditor>

export function ProgramCueRow(props: ProgramCueRowProps) {
  return <CueCardEditor {...props} />
}
