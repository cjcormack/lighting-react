import type { ChannelRef } from '../store/fixtures'

// === Types ===

export interface GroupSummary {
  name: string
  memberCount: number
  capabilities: string[]
  symmetricMode: string
  defaultDistribution: string
  /**
   * Ids of the Looks the backend reports as compatible with this group.
   *
   * **Capability-only**: "does this group have colour/position at all", never "was this Look
   * authored against that model", and no Look is excluded on any other ground — the "deferred
   * Looks only" this used to claim describes nothing now that every Look row is bound. It
   * answers for a Look's *deferred effects*, which are what the layer's targets supply.
   *
   * Known hole, and it is the backend's to close: a rows-only Look has an empty capability set,
   * so it is reported compatible with everything. Do not filter here — compatibility is one
   * answer, given server-side, or it drifts.
   */
  compatibleLookIds: number[]
}

export interface GroupMember {
  fixtureKey: string
  fixtureName: string
  index: number
  normalizedPosition: number
  panOffset: number
  tiltOffset: number
  symmetricInvert: boolean
  tags: string[]
}

export interface GroupDetail extends GroupSummary {
  members: GroupMember[]
}

export type BlendMode = 'OVERRIDE' | 'ADDITIVE' | 'MULTIPLY' | 'MAX' | 'MIN'

export type ElementMode = 'PER_FIXTURE' | 'FLAT'

export type DistributionStrategy =
  | 'LINEAR'
  | 'UNIFIED'
  | 'CENTER_OUT'
  | 'EDGES_IN'
  | 'REVERSE'
  | 'SPLIT'
  | 'PING_PONG'
  | 'RANDOM'
  | 'POSITIONAL'

export type DimmerEffectType =
  | 'sinewave'
  | 'pulse'
  | 'rampup'
  | 'rampdown'
  | 'triangle'
  | 'squarewave'
  | 'strobe'
  | 'flicker'
  | 'breathe'

export type ColourEffectType =
  | 'rainbowcycle'
  | 'colourstrobe'
  | 'colourpulse'
  | 'colourfade'
  | 'colourflicker'

export type PositionEffectType =
  | 'circle'
  | 'figure8'
  | 'sweep'
  | 'pansweep'
  | 'tiltsweep'
  | 'randomposition'

export type EffectType = DimmerEffectType | ColourEffectType | PositionEffectType

export interface ApplyFxRequest {
  effectType: EffectType
  propertyName: string
  beatDivision: number
  blendMode: BlendMode
  distribution: DistributionStrategy
  phaseOffset: number
  parameters: Record<string, string>
  elementMode?: ElementMode
  elementFilter?: string
  stepTiming?: boolean
  /** Speed master to subscribe to, as the master's uuid (omitted → master 1). */
  speedMasterUuid?: string
  /** Wall-clock rate master, as the master's uuid (omitted → unscaled). */
  rateSpeedMasterUuid?: string
  /**
   * Create the effect in the programmer's reserved priority band, so it composes *on top of*
   * programmer values instead of being suppressed by them, and Clear sweeps it with them.
   * Set by the busking pad; cue and script authoring leave it off.
   */
  programmerOwned?: boolean
}

export interface ApplyFxResponse {
  effectId: number
}

export interface GroupActiveEffect {
  id: number
  effectType: string
  propertyName: string
  beatDivision: number
  blendMode: BlendMode
  distribution: DistributionStrategy
  isRunning: boolean
  phaseOffset: number
  currentPhase: number
  parameters: Record<string, string>
  elementMode: ElementMode | null
  elementFilter: string | null
  stepTiming: boolean
  cueId: number | null
  /** Speed master this effect subscribes to (null → master 1). */
  speedMasterUuid?: string | null
  /** Wall-clock rate master (null → unscaled); only WALL_CLOCK effects read it. */
  rateSpeedMasterUuid?: string | null
}

export interface ClearFxResponse {
  removedCount: number
}

// === Group Property Types ===

export type GroupPropertyDescriptor =
  | GroupSliderPropertyDescriptor
  | GroupColourPropertyDescriptor
  | GroupPositionPropertyDescriptor
  | GroupSettingPropertyDescriptor

export interface GroupSliderPropertyDescriptor {
  type: 'slider'
  name: string
  displayName: string
  category: string
  min: number
  max: number
  memberChannels: ChannelRef[]
}

export interface MemberColourChannels {
  fixtureKey: string
  redChannel: ChannelRef
  greenChannel: ChannelRef
  blueChannel: ChannelRef
  whiteChannel?: ChannelRef
  amberChannel?: ChannelRef
  uvChannel?: ChannelRef
}

export interface GroupColourPropertyDescriptor {
  type: 'colour'
  name: string
  displayName: string
  category: 'colour'
  memberColourChannels: MemberColourChannels[]
}

export interface MemberPositionChannels {
  fixtureKey: string
  panChannel: ChannelRef
  tiltChannel: ChannelRef
  panMin: number
  panMax: number
  tiltMin: number
  tiltMax: number
}

export interface GroupPositionPropertyDescriptor {
  type: 'position'
  name: string
  displayName: string
  category: 'position'
  memberPositionChannels: MemberPositionChannels[]
}

export interface MemberSettingChannel {
  fixtureKey: string
  channel: ChannelRef
}

export interface SettingOption {
  name: string
  level: number
  displayName: string
  colourPreview?: string
}

export interface GroupSettingPropertyDescriptor {
  type: 'setting'
  name: string
  displayName: string
  category: string
  options: SettingOption[]
  memberChannels: MemberSettingChannel[]
}
