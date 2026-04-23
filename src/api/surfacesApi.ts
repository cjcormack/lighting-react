import { InternalApiConnection } from "./internalApi"
import { Subscription } from "./subscription"
import { createWsSubscribable } from "./wsSubscriptionFactory"

// Types mirror `uk.me.cormack.lighting7.midi.BindingTarget` and related Kotlin
// classes on the backend. Keep field names in sync with kotlinx.serialization.

/** Continuous target: fixture property driven by a fader/encoder. */
export interface FixturePropertyTarget {
  type: "fixtureProperty"
  fixtureKey: string
  propertyName: string
}

/** Continuous target: fixture-group property driven by a fader/encoder. */
export interface GroupPropertyTarget {
  type: "groupProperty"
  groupName: string
  propertyName: string
}

export interface CueStackGoTarget {
  type: "cueStackGo"
  stackId: number
}

export interface CueStackBackTarget {
  type: "cueStackBack"
  stackId: number
}

export interface CueStackPauseTarget {
  type: "cueStackPause"
  stackId: number
}

export interface FireCueTarget {
  type: "fireCue"
  cueId: number
}

/** Flash wraps either a FixtureProperty or GroupProperty continuous target. */
export interface FlashTarget {
  type: "flash"
  target: FixturePropertyTarget | GroupPropertyTarget
  max?: number
}

export interface BlackoutTarget {
  type: "blackout"
}

export interface GrandMasterToggleTarget {
  type: "grandMasterToggle"
}

export interface SetBankTarget {
  type: "setBank"
  deviceTypeKey: string
  bank: string
}

export type BindingTarget =
  | FixturePropertyTarget
  | GroupPropertyTarget
  | CueStackGoTarget
  | CueStackBackTarget
  | CueStackPauseTarget
  | FireCueTarget
  | FlashTarget
  | BlackoutTarget
  | GrandMasterToggleTarget
  | SetBankTarget

export type TakeoverPolicy = "IMMEDIATE" | "PICKUP"

/**
 * Dead-reference diagnostics. `ok` is the happy path; every other variant means the
 * binding's target no longer resolves against the current project (fixture renamed,
 * stack / cue deleted, bank removed from the device profile, etc.) and the router
 * drops inbound events rather than silently no-op.
 *
 * Mirrors `uk.me.cormack.lighting7.fx.AssignmentHealth` on the backend — the fixture /
 * group / property variants are shared with cue-authoring; stack / cue / bank variants
 * are surface-only.
 */
export type BindingHealth =
  | { type: "ok" }
  | { type: "missingFixture"; fixtureKey: string }
  | { type: "missingGroup"; groupName: string }
  | { type: "missingProperty"; targetKey: string; propertyName: string }
  | { type: "missingStack"; stackId: number }
  | { type: "missingCue"; cueId: number }
  | { type: "unknownBank"; deviceTypeKey: string; bankId: string }

/** A single persisted binding. */
export interface ControlSurfaceBinding {
  id: number
  projectId: number
  deviceTypeKey: string
  controlId: string
  bank: string | null
  target: BindingTarget
  targetType: string
  takeoverPolicy: TakeoverPolicy | null
  sortOrder: number
  health: BindingHealth
}

export interface CreateSurfaceBindingRequest {
  deviceTypeKey: string
  controlId: string
  bank?: string | null
  target: BindingTarget
  takeoverPolicy?: TakeoverPolicy | null
  sortOrder?: number
}

export interface UpdateSurfaceBindingRequest {
  deviceTypeKey?: string
  controlId?: string
  /** `bankPresent: true` with `bank: null` clears the bank. */
  bank?: string | null
  bankPresent?: boolean
  target?: BindingTarget
  /** `takeoverPolicyPresent: true` with `takeoverPolicy: null` clears. */
  takeoverPolicy?: TakeoverPolicy | null
  takeoverPolicyPresent?: boolean
  sortOrder?: number
}

// Device-type profile — discriminated union for the descriptor sub-types.

export type FaderResolution = "SEVEN_BIT" | "FOURTEEN_BIT"
export type EncoderRingStyle = "NONE" | "SINGLE_DOT" | "FAN" | "PAN"
export type LedFeedback = "NONE" | "ON_OFF" | "BRIGHTNESS" | "COLOUR"

export interface FaderControl {
  type: "fader"
  controlId: string
  label: string
  cc: number
  channel: number
  hasMotor: boolean
  motorCc: number | null
  touchNote: number | null
  resolution: FaderResolution
}

export interface EncoderControl {
  type: "encoder"
  controlId: string
  label: string
  cc: number
  channel: number
  ringCc: number | null
  ringStyle: EncoderRingStyle
  pushNote: number | null
  pushLed: LedFeedback
}

export interface ButtonControl {
  type: "button"
  controlId: string
  label: string
  note: number
  channel: number
  ledFeedback: LedFeedback
}

export interface BankButtonControl {
  type: "bankButton"
  controlId: string
  label: string
  note: number
  channel: number
  bankId: string
}

export type ControlDescriptor =
  | FaderControl
  | EncoderControl
  | ButtonControl
  | BankButtonControl

export interface BankDefinition {
  id: string
  name: string
}

export interface ControlSurfaceType {
  typeKey: string
  vendor: string | null
  product: string | null
  portPattern: string | null
  className: string
  controls: ControlDescriptor[]
  banks: BankDefinition[]
}

export interface SurfaceDeviceInfo {
  displayKey: string
  displayName: string
  typeKey: string | null
  isMatched: boolean
  hasInputPort: boolean
  hasOutputPort: boolean
  activeBank: string | null
}

export type PickupState = "ENGAGED" | "AWAITING_PICKUP"

export interface PickupChange {
  displayKey: string
  controlId: string
  state: PickupState
  target: number | null
}

export type BindingChangeType = "added" | "updated" | "removed" | "reloaded"

export interface BindingsChangeEvent {
  projectId: number
  changeType: BindingChangeType
  bindingId: number | null
}

export interface LearnCapturedEvent {
  sessionId: string
  projectId: number
  deviceTypeKey: string
  controlId: string
}

export interface LearnStartedEvent {
  sessionId: string
  projectId: number
  deviceTypeKey: string | null
  deadlineMs: number
}

export interface LearnCancelledEvent {
  sessionId: string
  reason: string
}

export interface LearnErrorEvent {
  sessionId: string | null
  message: string
}

export interface LearnCommittedEvent {
  sessionId: string
  bindingId: number
  projectId: number
}

export interface SurfacesWsApi {
  /** List of all attached MIDI devices (matched + unmatched). */
  subscribeDevices(fn: (devices: SurfaceDeviceInfo[]) => void): Subscription
  /** Active bank per `deviceTypeKey`. */
  subscribeBanks(fn: (banks: Record<string, string>) => void): Subscription
  /** Pickup-state transitions (non-motor fader soft takeover). */
  subscribePickup(fn: (change: PickupChange) => void): Subscription
  /** Binding list membership changed (added / updated / removed / reloaded). */
  subscribeBindingsChanged(fn: (event: BindingsChangeEvent) => void): Subscription
  /** Learn session events scoped to this connection. */
  subscribeLearn(fn: (event: LearnEvent) => void): Subscription

  /** Request the initial snapshots when mounted. */
  requestDevicesState(): void
  requestBanksState(): void
  requestScalerState(): void

  /** Set the active bank for a device type (pass null to clear). */
  setBank(deviceTypeKey: string, bank: string | null): void
  /** Start a MIDI Learn session; responses come back via `subscribeLearn`. */
  beginLearn(projectId: number, deviceTypeKey?: string | null): void
  cancelLearn(sessionId: string): void
  commitLearn(
    sessionId: string,
    target: BindingTarget,
    bank?: string | null,
    takeoverPolicy?: TakeoverPolicy | null,
  ): void

  /** Scaler state (blackout / grand master). */
  subscribeScaler(fn: (state: ScalerState) => void): Subscription
  setBlackout(enabled: boolean): void
  setGrandMaster(enabled: boolean): void
}

export interface ScalerState {
  blackoutEnabled: boolean
  grandMasterEnabled: boolean
}

export type LearnEvent =
  | ({ type: "started" } & LearnStartedEvent)
  | ({ type: "captured" } & LearnCapturedEvent)
  | ({ type: "committed" } & LearnCommittedEvent)
  | ({ type: "cancelled" } & LearnCancelledEvent)
  | ({ type: "error" } & LearnErrorEvent)

type InboundMessage =
  | { type: "surfaceDevices.state"; devices: SurfaceDeviceInfo[] }
  | { type: "surfaceBank.state"; activeBanks: Record<string, string> }
  | { type: "surfaceBank.changed"; deviceTypeKey: string; previousBank: string | null; newBank: string | null }
  | ({ type: "surfacePickup.changed" } & PickupChange)
  | ({ type: "surfaceBindingsChanged" } & BindingsChangeEvent)
  | ({ type: "surfaceScaler.state" } & ScalerState)
  | ({ type: "surfaceLearn.started" } & LearnStartedEvent)
  | ({ type: "surfaceLearn.captured" } & LearnCapturedEvent)
  | ({ type: "surfaceLearn.committed" } & LearnCommittedEvent)
  | ({ type: "surfaceLearn.cancelled" } & LearnCancelledEvent)
  | ({ type: "surfaceLearn.error" } & LearnErrorEvent)

const LEARN_TYPE_MAP: Record<string, LearnEvent["type"]> = {
  "surfaceLearn.started": "started",
  "surfaceLearn.captured": "captured",
  "surfaceLearn.committed": "committed",
  "surfaceLearn.cancelled": "cancelled",
  "surfaceLearn.error": "error",
}

export function createSurfacesWsApi(conn: InternalApiConnection): SurfacesWsApi {
  const devices = createWsSubscribable<SurfaceDeviceInfo[]>()
  const banks = createWsSubscribable<Record<string, string>>()
  const pickup = createWsSubscribable<PickupChange>()
  const bindings = createWsSubscribable<BindingsChangeEvent>()
  const learn = createWsSubscribable<LearnEvent>()
  const scaler = createWsSubscribable<ScalerState>()

  // Cached latest snapshots so newly-mounted subscribers can read current
  // state synchronously without a round-trip.
  let lastDevices: SurfaceDeviceInfo[] | null = null
  let lastBanks: Record<string, string> | null = null
  let lastScaler: ScalerState | null = null

  conn.subscribe((evType, ev) => {
    if (evType === "open") {
      conn.send(JSON.stringify({ type: "surfaceDevices.state" }))
      conn.send(JSON.stringify({ type: "surfaceBank.state" }))
      conn.send(JSON.stringify({ type: "surfaceScaler.state" }))
      return
    }
    if (evType !== "message" || !(ev instanceof MessageEvent)) return

    let parsed: InboundMessage | null = null
    try {
      parsed = JSON.parse(ev.data)
    } catch {
      return
    }
    if (!parsed) return

    switch (parsed.type) {
      case "surfaceDevices.state":
        lastDevices = parsed.devices
        devices.notify(parsed.devices)
        break
      case "surfaceBank.state":
        lastBanks = parsed.activeBanks
        banks.notify(parsed.activeBanks)
        break
      case "surfaceBank.changed": {
        // Apply the delta locally; the server also pushes a fresh
        // `surfaceDevices.state` via its combine() flow so that channel
        // stays consistent independently.
        const next: Record<string, string> = { ...(lastBanks ?? {}) }
        if (parsed.newBank == null) delete next[parsed.deviceTypeKey]
        else next[parsed.deviceTypeKey] = parsed.newBank
        lastBanks = next
        banks.notify(next)
        break
      }
      case "surfacePickup.changed":
        pickup.notify({
          displayKey: parsed.displayKey,
          controlId: parsed.controlId,
          state: parsed.state,
          target: parsed.target,
        })
        break
      case "surfaceBindingsChanged":
        bindings.notify({
          projectId: parsed.projectId,
          changeType: parsed.changeType,
          bindingId: parsed.bindingId,
        })
        break
      case "surfaceScaler.state":
        lastScaler = {
          blackoutEnabled: parsed.blackoutEnabled,
          grandMasterEnabled: parsed.grandMasterEnabled,
        }
        scaler.notify(lastScaler)
        break
      default: {
        const outType = LEARN_TYPE_MAP[parsed.type]
        if (outType) {
          const { type: _ignored, ...rest } = parsed
          learn.notify({ type: outType, ...rest } as LearnEvent)
        }
      }
    }
  })

  const subscribeCached = <T>(
    api: { subscribe(fn: (v: T) => void): Subscription },
    snapshot: () => T | null,
  ) => (fn: (v: T) => void): Subscription => {
    const sub = api.subscribe(fn)
    const s = snapshot()
    if (s != null) fn(s)
    return sub
  }

  return {
    subscribeDevices: subscribeCached(devices.api, () => lastDevices),
    subscribeBanks: subscribeCached(banks.api, () => lastBanks),
    subscribePickup: pickup.api.subscribe,
    subscribeBindingsChanged: bindings.api.subscribe,
    subscribeLearn: learn.api.subscribe,
    subscribeScaler: subscribeCached(scaler.api, () => lastScaler),
    requestDevicesState: () => conn.send(JSON.stringify({ type: "surfaceDevices.state" })),
    requestBanksState: () => conn.send(JSON.stringify({ type: "surfaceBank.state" })),
    requestScalerState: () => conn.send(JSON.stringify({ type: "surfaceScaler.state" })),
    setBank: (deviceTypeKey, bank) =>
      conn.send(JSON.stringify({ type: "surfaceBank.set", deviceTypeKey, bank })),
    beginLearn: (projectId, deviceTypeKey) =>
      conn.send(JSON.stringify({
        type: "surfaceLearn.begin",
        projectId,
        deviceTypeKey: deviceTypeKey ?? null,
      })),
    cancelLearn: (sessionId) =>
      conn.send(JSON.stringify({ type: "surfaceLearn.cancel", sessionId })),
    commitLearn: (sessionId, target, bank, takeoverPolicy) =>
      conn.send(JSON.stringify({
        type: "surfaceLearn.commit",
        sessionId,
        target,
        bank: bank ?? null,
        takeoverPolicy: takeoverPolicy ?? null,
      })),
    setBlackout: (enabled) =>
      conn.send(JSON.stringify({ type: "surfaceScaler.setBlackout", enabled })),
    setGrandMaster: (enabled) =>
      conn.send(JSON.stringify({ type: "surfaceScaler.setGrandMaster", enabled })),
  }
}
