import type { BuskPad } from '@/api/buskApi'
import type { EffectPresence } from './buskingTypes'

/**
 * What a pad does and how it lights, handed down from the view that owns the selection and the
 * queries.
 *
 * One object rather than four props because it is threaded through two layers of pure layout
 * (`BuskPage` → `BuskBankCluster`) that have no opinion about any of it.
 */
export interface PadBehaviour {
  /** A template or Look pad's ring, from the desk's resolved applied state. */
  presenceOf: (pad: BuskPad) => EffectPresence
  /** A cue pad's green: its stack has this cue on stage, playhead or not. */
  isLive: (pad: BuskPad) => boolean
  onPress: (pad: BuskPad) => void
  /** Long press: go to where the record is actually edited. */
  onInspect: (pad: BuskPad) => void
}
