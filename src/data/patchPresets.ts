export const RIGGING_POSITION_FALLBACK: readonly string[] = [
  'FOH',
  'LX1',
  'LX2',
  'LX3',
  'ADV 1',
  'ADV 2',
  'USR',
  'DSL',
  'DSR',
  'USL',
  'MID',
  'BOOM L',
  'BOOM R',
]

export interface BeamPreset {
  name: string
  deg: number
}

export const BEAM_PRESETS: readonly BeamPreset[] = [
  { name: 'Spot', deg: 14 },
  { name: 'Narrow', deg: 26 },
  { name: 'Medium', deg: 36 },
  { name: 'Wide', deg: 50 },
  { name: 'Flood', deg: 70 },
]
