import type { InternalApiConnection } from './internalApi'
import type { Subscription } from './subscription'

/**
 * Client for the backend's Layer-2 programmer (`programmer.*` WS ops plus the
 * `provenanceState` broadcast). See `lighting7/docs/lighting-composition-model.md`
 * §"Layer 2 — Programmer" for the semantics this mirrors.
 *
 * Two things about the wire shape drive the design here:
 *
 * 1. **Programmer replies are unicast.** `entryChanged` / `entryCleared` / `cleared` /
 *    `blindState` / `state` come back only to the connection that asked. Writes made by
 *    MIDI surfaces, locate, preset toggles or another browser tab never produce a reply
 *    we can see.
 * 2. **`provenanceState` is the only broadcast**, and it fires on every layer event —
 *    including every programmer mutation, whoever made it.
 *
 * So provenance doubles as the invalidation signal: on receipt we debounce briefly and
 * re-request `programmer.state`. Own-connection replies are additionally applied straight
 * to the cache so a local edit paints without waiting for the round trip.
 */

export type ProgrammerTargetType = 'fixture' | 'group'

/** Which layer produced the current winning value for a (targetKey, propertyName). */
export type ProvenanceSource = 'PARKED' | 'PROGRAMMER' | 'EFFECT' | 'CUE'

export interface ProgrammerEntry {
  targetKey: string
  propertyName: string
  /** Canonical assignment string — see `src/lib/programmerValue.ts`. */
  value: string
  /** Winning slot's owner: `web` | `surface` | `flash` | `locate` | `unpark` | `preset:{id}`. */
  owner: string
  /** Sticky operator-edit flag. False marks a mechanical hand-down (unpark). */
  touched: boolean
  /** Group name when the write came through a group control. */
  sourceGroup?: string
  /** Every owner holding this property, most recent first. */
  owners: string[]
}

export interface ProgrammerChannelEntry {
  universe: number
  channel: number
  value: number
  owner: string
  touched: boolean
}

export interface ProvenanceEntry {
  targetKey: string
  propertyName: string
  source: ProvenanceSource
  cueId?: number
  cueStackId?: number
  effectId?: number
}

/**
 * What Include last pulled into the programmer, and therefore what a bare Update writes back
 * to. Null means nothing is staged from a cue, so Update falls through to the Mode B checklist.
 */
export interface IncludedTarget {
  /** `CUE` today; palettes arrive in Session 4. */
  kind: string
  cueId: number
  cueStackId?: number
  cueName?: string
  cueNumber?: string
}

/** The client-side view of the programmer, rebuilt from each `programmer.state` snapshot. */
export interface ProgrammerState {
  blind: boolean
  /** Keyed by [programmerKey]. */
  entries: ReadonlyMap<string, ProgrammerEntry>
  channels: readonly ProgrammerChannelEntry[]
  /** Keyed by [programmerKey]. A key absent here is baseline-owned. */
  provenance: ReadonlyMap<string, ProvenanceEntry>
  lastIncluded: IncludedTarget | null
}

/** Per-cell lookup result: what the programmer and the cascade say about one property. */
export interface ProgrammerKeyState {
  entry?: ProgrammerEntry
  provenance?: ProvenanceEntry
}

// ── Outgoing ────────────────────────────────────────────────────────────────

interface ProgrammerSetOutgoing {
  type: 'programmer.set'
  targetType: ProgrammerTargetType
  targetKey: string
  propertyName: string
  value: string
  fadeMs?: number
  sourceGroup?: string
}

interface ProgrammerSetColourOutgoing {
  type: 'programmer.setColour'
  targetType: ProgrammerTargetType
  targetKey: string
  propertyName?: string
  r: number
  g: number
  b: number
  w?: number
  a?: number
  uv?: number
  fadeMs?: number
  sourceGroup?: string
}

interface ProgrammerSetPositionOutgoing {
  type: 'programmer.setPosition'
  targetType: ProgrammerTargetType
  targetKey: string
  pan: number
  tilt: number
  fadeMs?: number
  sourceGroup?: string
}

interface ProgrammerClearEntryOutgoing {
  type: 'programmer.clearEntry'
  targetType: ProgrammerTargetType
  targetKey: string
  propertyName: string
  fadeMs?: number
}

interface ProgrammerClearAllOutgoing {
  type: 'programmer.clearAll'
  fadeMs?: number
}

interface ProgrammerSetBlindOutgoing {
  type: 'programmer.setBlind'
  blind: boolean
  fadeMs?: number
}

interface ProgrammerStateOutgoing {
  type: 'programmer.state'
}

export type ProgrammerOutgoingMessage =
  | ProgrammerSetOutgoing
  | ProgrammerSetColourOutgoing
  | ProgrammerSetPositionOutgoing
  | ProgrammerClearEntryOutgoing
  | ProgrammerClearAllOutgoing
  | ProgrammerSetBlindOutgoing
  | ProgrammerStateOutgoing

// ── Incoming ────────────────────────────────────────────────────────────────

interface ProgrammerStateIncoming {
  type: 'programmer.state'
  blind: boolean
  entries: ProgrammerEntry[]
  channels: ProgrammerChannelEntry[]
  lastIncluded?: IncludedTarget | null
}

interface ProgrammerIncludeTargetIncoming {
  type: 'programmer.includeTarget'
  target?: IncludedTarget | null
}

interface ProgrammerEntryChangedIncoming {
  type: 'programmer.entryChanged'
  targetType: ProgrammerTargetType
  targetKey: string
  propertyName: string
  value: string
}

interface ProgrammerEntryClearedIncoming {
  type: 'programmer.entryCleared'
  targetType: ProgrammerTargetType
  targetKey: string
  propertyName: string
}

interface ProgrammerClearedIncoming {
  type: 'programmer.cleared'
  entryCount: number
  /** Programmer-band FX swept alongside the values. Omitted by the server when 0. */
  effectsCleared?: number
}

interface ProgrammerBlindStateIncoming {
  type: 'programmer.blindState'
  blind: boolean
}

interface ProgrammerErrorIncoming {
  type: 'programmer.error'
  message: string
}

interface ProvenanceStateIncoming {
  type: 'provenanceState'
  entries: ProvenanceEntry[]
}

type ProgrammerIncomingMessage =
  | ProgrammerStateIncoming
  | ProgrammerIncludeTargetIncoming
  | ProgrammerEntryChangedIncoming
  | ProgrammerEntryClearedIncoming
  | ProgrammerClearedIncoming
  | ProgrammerBlindStateIncoming
  | ProgrammerErrorIncoming
  | ProvenanceStateIncoming

// ── Public surface ──────────────────────────────────────────────────────────

export interface ProgrammerApi {
  getState(): ProgrammerState
  /** Programmer entry + provenance for one property. Allocation-free on the hot path. */
  getKeyState(targetKey: string, propertyName: string): ProgrammerKeyState
  isBlind(): boolean
  /** Number of stored property entries (the "programmer holds data" count). */
  entryCount(): number
  /** What Include last loaded, or null. Drives the Update button's label and target. */
  lastIncluded(): IncludedTarget | null

  set(
    targetType: ProgrammerTargetType,
    targetKey: string,
    propertyName: string,
    value: string,
    fadeMs?: number,
    /**
     * Names the group control this write came from, for fan-outs that can't send
     * `targetType: 'group'` (a group virtual dimmer over heterogeneous members, a Highlight
     * release restoring per-fixture values). It only widens the shape Record can emit, and
     * the server drops it unless the group really contains this fixture.
     */
    sourceGroup?: string,
  ): void
  setColour(
    targetType: ProgrammerTargetType,
    targetKey: string,
    propertyName: string,
    rgb: { r: number; g: number; b: number; w?: number; a?: number; uv?: number },
    fadeMs?: number,
    sourceGroup?: string,
  ): void
  setPosition(
    targetType: ProgrammerTargetType,
    targetKey: string,
    pan: number,
    tilt: number,
    fadeMs?: number,
    sourceGroup?: string,
  ): void
  clearEntry(
    targetType: ProgrammerTargetType,
    targetKey: string,
    propertyName: string,
    fadeMs?: number,
  ): void
  clearAll(fadeMs?: number): void
  setBlind(blind: boolean, fadeMs?: number): void
  requestState(): void

  /** Fires on any change to the programmer or provenance. Drives coarse consumers. */
  subscribe(fn: (state: ProgrammerState) => void): Subscription
  /**
   * Fires only when this one property's entry or provenance changed. This is what keeps a
   * few-hundred-row sheet from re-rendering every cell on each provenance push — the same
   * split `channelsApi.subscribeToChannel` makes for DMX values.
   */
  subscribeToKey(
    targetKey: string,
    propertyName: string,
    fn: (state: ProgrammerKeyState) => void,
  ): Subscription
  /** Errors from `programmer.*` ops, so callers can surface a toast. */
  subscribeToErrors(fn: (message: string) => void): Subscription
}

/** Cache/subscription key for a (target, property) pair. */
export function programmerKey(targetKey: string, propertyName: string): string {
  return `${targetKey}|${propertyName}`
}

/**
 * How long to wait after a `provenanceState` push before re-requesting `programmer.state`.
 * Provenance is already coalesced ~50 ms server-side; this second stage collapses the
 * bursts a cue change or an effect starting produces into a single refetch.
 */
const STATE_REFETCH_DEBOUNCE_MS = 100

const EMPTY_KEY_STATE: ProgrammerKeyState = {}

export function createProgrammerApi(conn: InternalApiConnection): ProgrammerApi {
  let blind = false
  let entries = new Map<string, ProgrammerEntry>()
  let channels: ProgrammerChannelEntry[] = []
  let provenance = new Map<string, ProvenanceEntry>()
  let lastIncluded: IncludedTarget | null = null

  let snapshot: ProgrammerState = { blind, entries, channels, provenance, lastIncluded }
  const rebuildSnapshot = () => {
    snapshot = { blind, entries, channels, provenance, lastIncluded }
  }

  let nextSubscriptionId = 1
  const stateSubscriptions = new Map<number, (state: ProgrammerState) => void>()
  const keySubscriptions = new Map<string, Map<number, (state: ProgrammerKeyState) => void>>()
  const errorSubscriptions = new Map<number, (message: string) => void>()

  const keyStateFor = (key: string): ProgrammerKeyState => {
    const entry = entries.get(key)
    const prov = provenance.get(key)
    if (!entry && !prov) return EMPTY_KEY_STATE
    return { entry, provenance: prov }
  }

  const notifyKeys = (keys: Iterable<string>) => {
    for (const key of keys) {
      const subs = keySubscriptions.get(key)
      if (!subs) continue
      const state = keyStateFor(key)
      subs.forEach((fn) => fn(state))
    }
  }

  const notifyState = () => {
    rebuildSnapshot()
    stateSubscriptions.forEach((fn) => fn(snapshot))
  }

  /**
   * Notify exactly the keys whose entry or provenance *value* changed between two maps.
   *
   * Compares by content, not identity: every snapshot is rebuilt from `JSON.parse`, so each
   * frame hands us structurally-equal-but-freshly-allocated objects. A `!==` check would call
   * every key changed on every frame, which would make this whole per-key channel a no-op —
   * an unrelated cue firing would wake every cell in the sheet, exactly what it exists to
   * prevent.
   */
  const changedKeys = <T>(
    before: ReadonlyMap<string, T>,
    after: ReadonlyMap<string, T>,
    signature: (value: T) => string,
  ): string[] => {
    const out: string[] = []
    for (const [key, value] of after) {
      const previous = before.get(key)
      if (previous === undefined || signature(previous) !== signature(value)) out.push(key)
    }
    for (const key of before.keys()) {
      if (!after.has(key)) out.push(key)
    }
    return out
  }

  // JSON, not a delimiter-joined string: group names and palette-ref values are free text,
  // so any separator character could also occur inside a field and make two different
  // entries compare equal.
  const entrySignature = (e: ProgrammerEntry) =>
    JSON.stringify([e.value, e.owner, e.touched, e.sourceGroup ?? null, e.owners])

  const provenanceSignature = (p: ProvenanceEntry) =>
    JSON.stringify([p.source, p.cueId ?? null, p.cueStackId ?? null, p.effectId ?? null])

  // Bare `setTimeout`, not `window.setTimeout`: this module is exercised by unit tests that
  // run without a DOM, and nothing here needs the window-typed handle.
  let refetchTimer: ReturnType<typeof setTimeout> | undefined
  const scheduleStateRefetch = () => {
    if (refetchTimer !== undefined) return
    refetchTimer = setTimeout(() => {
      refetchTimer = undefined
      conn.send(JSON.stringify({ type: 'programmer.state' }))
    }, STATE_REFETCH_DEBOUNCE_MS)
  }

  const applyStateSnapshot = (message: ProgrammerStateIncoming) => {
    const nextEntries = new Map<string, ProgrammerEntry>()
    for (const entry of message.entries) {
      nextEntries.set(programmerKey(entry.targetKey, entry.propertyName), entry)
    }
    const touched = changedKeys(entries, nextEntries, entrySignature)
    blind = message.blind
    entries = nextEntries
    channels = message.channels
    // The include target isn't per-key, so it rides `notifyState` only and is deliberately
    // *not* part of `entrySignature` — including it there would wake every cell whenever the
    // operator included a different cue.
    lastIncluded = message.lastIncluded ?? null
    notifyKeys(touched)
    notifyState()
  }

  const applyProvenance = (message: ProvenanceStateIncoming) => {
    const next = new Map<string, ProvenanceEntry>()
    for (const entry of message.entries) {
      next.set(programmerKey(entry.targetKey, entry.propertyName), entry)
    }
    const touched = changedKeys(provenance, next, provenanceSignature)
    provenance = next
    notifyKeys(touched)
    notifyState()
    // Provenance is the only broadcast the server sends for programmer activity, so it is
    // also our cue to re-read the values — including writes we didn't make.
    scheduleStateRefetch()
  }

  /**
   * Optimistic local echo of our own write, so a drag paints at input rate instead of at
   * round-trip rate. The authoritative `programmer.state` refetch that provenance triggers
   * lands ~100 ms later and overwrites this with the server's view.
   */
  const applyLocalEntry = (message: ProgrammerEntryChangedIncoming) => {
    const key = programmerKey(message.targetKey, message.propertyName)
    const existing = entries.get(key)
    const next = new Map(entries)
    // This reply is only ever our own write (the op is unicast), so the winning slot is now
    // `web` — even if some other owner held the property a moment ago. Carrying the previous
    // owner forward would make a fader drag over a located fixture report "locate" as the
    // thing driving it until the refetch lands. `sourceGroup` is dropped for the same reason:
    // a direct write did not come through a group control.
    const owners = ['web', ...(existing?.owners ?? []).filter((o) => o !== 'web')]
    next.set(key, {
      targetKey: message.targetKey,
      propertyName: message.propertyName,
      value: message.value,
      owner: 'web',
      touched: true,
      owners,
    })
    entries = next
    notifyKeys([key])
    notifyState()
  }

  const applyLocalClear = (message: ProgrammerEntryClearedIncoming) => {
    const key = programmerKey(message.targetKey, message.propertyName)
    if (!entries.has(key)) return
    const next = new Map(entries)
    next.delete(key)
    entries = next
    notifyKeys([key])
    notifyState()
  }

  const handleMessage = (message: ProgrammerIncomingMessage) => {
    switch (message.type) {
      case 'programmer.state':
        applyStateSnapshot(message)
        break
      case 'programmer.includeTarget':
        // Broadcast, unlike the other programmer replies: the programmer is shared, so a
        // second tab's Update button must offer the same target.
        lastIncluded = message.target ?? null
        notifyState()
        break
      case 'provenanceState':
        applyProvenance(message)
        break
      case 'programmer.entryChanged':
        applyLocalEntry(message)
        break
      case 'programmer.entryCleared':
        applyLocalClear(message)
        break
      case 'programmer.cleared': {
        const touched = [...entries.keys()]
        entries = new Map()
        channels = []
        // Clear releases everything Include staged, so the server drops the target too.
        lastIncluded = null
        notifyKeys(touched)
        notifyState()
        break
      }
      case 'programmer.blindState':
        blind = message.blind
        notifyState()
        break
      case 'programmer.error':
        errorSubscriptions.forEach((fn) => fn(message.message))
        break
    }
  }

  conn.subscribe((evType, ev) => {
    if (evType === 'open') {
      conn.send(JSON.stringify({ type: 'programmer.state' }))
      return
    }
    if (evType !== 'message' || !(ev instanceof MessageEvent)) return
    // Fast path: skip JSON.parse for the channelState / fxState firehose. Both
    // discriminators we care about are checked as raw substrings first.
    if (typeof ev.data !== 'string') return
    if (ev.data.indexOf('"programmer.') === -1 && ev.data.indexOf('"provenanceState"') === -1) {
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(ev.data)
    } catch {
      return
    }
    if (!parsed || typeof parsed !== 'object') return
    const t = (parsed as Record<string, unknown>).type
    if (typeof t !== 'string') return
    if (t !== 'provenanceState' && !t.startsWith('programmer.')) return
    handleMessage(parsed as ProgrammerIncomingMessage)
  })

  const send = (message: ProgrammerOutgoingMessage) => conn.send(JSON.stringify(message))

  return {
    getState: () => snapshot,
    getKeyState: (targetKey, propertyName) => keyStateFor(programmerKey(targetKey, propertyName)),
    isBlind: () => blind,
    entryCount: () => entries.size,
    lastIncluded: () => lastIncluded,

    set(targetType, targetKey, propertyName, value, fadeMs, sourceGroup) {
      send({
        type: 'programmer.set',
        targetType,
        targetKey,
        propertyName,
        value,
        fadeMs,
        sourceGroup,
      })
    },
    setColour(targetType, targetKey, propertyName, rgb, fadeMs, sourceGroup) {
      send({
        type: 'programmer.setColour',
        targetType,
        targetKey,
        propertyName,
        ...rgb,
        fadeMs,
        sourceGroup,
      })
    },
    setPosition(targetType, targetKey, pan, tilt, fadeMs, sourceGroup) {
      send({ type: 'programmer.setPosition', targetType, targetKey, pan, tilt, fadeMs, sourceGroup })
    },
    clearEntry(targetType, targetKey, propertyName, fadeMs) {
      send({ type: 'programmer.clearEntry', targetType, targetKey, propertyName, fadeMs })
    },
    clearAll(fadeMs) {
      send({ type: 'programmer.clearAll', fadeMs })
    },
    setBlind(blindOn, fadeMs) {
      send({ type: 'programmer.setBlind', blind: blindOn, fadeMs })
    },
    requestState() {
      send({ type: 'programmer.state' })
    },

    subscribe(fn) {
      const id = nextSubscriptionId++
      stateSubscriptions.set(id, fn)
      return { unsubscribe: () => { stateSubscriptions.delete(id) } }
    },
    subscribeToKey(targetKey, propertyName, fn) {
      const key = programmerKey(targetKey, propertyName)
      const id = nextSubscriptionId++
      let subs = keySubscriptions.get(key)
      if (!subs) {
        subs = new Map()
        keySubscriptions.set(key, subs)
      }
      subs.set(id, fn)
      return {
        unsubscribe: () => {
          const current = keySubscriptions.get(key)
          if (!current) return
          current.delete(id)
          // Drop the bucket once empty — a long session drags the selection across the
          // whole rig, and leaking one Map per (fixture, property) adds up.
          if (current.size === 0) keySubscriptions.delete(key)
        },
      }
    },
    subscribeToErrors(fn) {
      const id = nextSubscriptionId++
      errorSubscriptions.set(id, fn)
      return { unsubscribe: () => { errorSubscriptions.delete(id) } }
    },
  }
}
