/**
 * REST types for speed masters — the named tempo buses effects subscribe to.
 *
 * Master 1 (`masterIndex === 1`) is the protected global master: a null uuid on a
 * `speedMasters.*` write means it, and every effect with no explicit master resolves to it.
 * The stored `bpm` here is the *starting* tempo — the
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
  /**
   * Effect-library category this master is the apply-time default for (`dimmer` / `colour` /
   * `position`), or null/absent to route nothing. Unique within a project — the server 409s
   * with `SPEED_MASTER_USAGE_TAKEN` on a second claimant.
   */
  usage?: string | null
  /**
   * Follow ratio over master 1: this master's tempo is `m1.bpm * followNum / followDen`.
   * Both null (or absent) means a manual tempo. Master 1 itself may never follow.
   */
  followNum?: number | null
  followDen?: number | null
  /** Persisted rows referencing this master. Gates delete. */
  referenceCount: number
}

export interface CreateSpeedMasterRequest {
  /** Defaults to "Master {index}" server-side. */
  name?: string
  bpm?: number
  notes?: string
  /** See {@link SpeedMaster.usage}. */
  usage?: string | null
  /** See {@link SpeedMaster.followNum} — both-or-neither, and never alongside `bpm`. */
  followNum?: number | null
  followDen?: number | null
}

/**
 * PUT patch body — **only the keys present are changed**, which is why every field is optional
 * and nullable rather than defaulted. Three server-side rules the caller must respect:
 *
 * - `followNum` and `followDen` move together. A half-patch is a 400; unlinking is both
 *   explicitly `null`.
 * - `bpm` must not be sent when the resulting state follows master 1 (400
 *   `SPEED_MASTER_FOLLOWER`) — a follower's tempo is derived, not stored.
 * - `usage` present-with-null clears the routing.
 */
export interface UpdateSpeedMasterRequest {
  name?: string
  bpm?: number
  notes?: string | null
  usage?: string | null
  followNum?: number | null
  followDen?: number | null
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

export const CODE_SPEED_MASTER_IN_USE = 'SPEED_MASTER_IN_USE'
