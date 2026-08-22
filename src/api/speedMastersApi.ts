/**
 * REST types for speed masters — the named tempo buses effects subscribe to.
 *
 * Master 1 (`masterIndex === 1`) is the protected global master: every legacy tempo
 * surface (`setFxBpm`, `tapTempo`, the ShowBar BPM tile) means it, and every effect with
 * no explicit master resolves to it. The stored `bpm` here is the *starting* tempo — the
 * live value streams over the `speedMasters.*` WS family (see `speedMastersWsApi.ts`).
 */
export interface SpeedMaster {
  id: number
  /** The identity references use — int ids are re-minted on project import; uuids survive. */
  uuid: string
  /** 1-based display index; 1 is the protected global master. */
  masterIndex: number
  name: string
  /** Stored (starting) tempo. Live tempo comes from the WS state instead. */
  bpm: number
  /** How the tempo was last set — display only. */
  source: 'MANUAL' | 'TAP'
  notes?: string | null
  /** Persisted rows referencing this master. Gates delete. */
  referenceCount: number
}

export interface CreateSpeedMasterRequest {
  /** Defaults to "Master {index}" server-side. */
  name?: string
  bpm?: number
  notes?: string
}

export interface UpdateSpeedMasterRequest {
  name?: string
  bpm?: number
  notes?: string | null
}

/** 409 body when deleting a referenced master without `force`. */
export interface SpeedMasterInUseResponse {
  error: string
  code: string
  referenceCount: number
  /** Effects stored on a Look. Was `presetEffectCount`, over the retired FX presets. */
  lookEffectCount: number
  cueAdHocEffectCount: number
  /** Per-layer speed-master overrides. Was `cuePresetApplicationCount`. */
  cueLayerCount: number
  cueIds: number[]
}

export const CODE_SPEED_MASTER_PROTECTED = 'SPEED_MASTER_PROTECTED'
export const CODE_SPEED_MASTER_IN_USE = 'SPEED_MASTER_IN_USE'
