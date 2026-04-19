import type { InternalApiConnection } from './internalApi'
import type { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'

export type CueEditMode = 'live' | 'blind'

export interface CueEditBeginEditOutgoing {
  type: 'cueEdit.beginEdit'
  cueId: number
  mode: CueEditMode
}

export interface CueEditEndEditOutgoing {
  type: 'cueEdit.endEdit'
  cueId: number
}

export interface CueEditSetModeOutgoing {
  type: 'cueEdit.setMode'
  cueId: number
  mode: CueEditMode
}

export interface CueEditSetChannelOutgoing {
  type: 'cueEdit.setChannel'
  cueId: number
  universe: number
  channel: number
  level: number
}

export interface CueEditSetPropertyOutgoing {
  type: 'cueEdit.setProperty'
  cueId: number
  targetType: 'fixture' | 'group'
  targetKey: string
  propertyName: string
  value: string
}

export interface CueEditSetPaletteOutgoing {
  type: 'cueEdit.setPalette'
  cueId: number
  palette: string[]
}

export interface CueEditAddPresetApplicationOutgoing {
  type: 'cueEdit.addPresetApplication'
  cueId: number
  presetId: number
  targets: Array<{ type: 'fixture' | 'group'; key: string }>
}

export interface CueEditAddAdHocEffectOutgoing {
  type: 'cueEdit.addAdHocEffect'
  cueId: number
  effect: Record<string, unknown>
}

export interface CueEditClearAssignmentOutgoing {
  type: 'cueEdit.clearAssignment'
  cueId: number
  targetType: 'fixture' | 'group'
  targetKey: string
  propertyName: string
}

export interface CueEditDiscardChangesOutgoing {
  type: 'cueEdit.discardChanges'
  cueId: number
}

export type CueEditOutgoingMessage =
  | CueEditBeginEditOutgoing
  | CueEditEndEditOutgoing
  | CueEditSetModeOutgoing
  | CueEditSetChannelOutgoing
  | CueEditSetPropertyOutgoing
  | CueEditSetPaletteOutgoing
  | CueEditAddPresetApplicationOutgoing
  | CueEditAddAdHocEffectOutgoing
  | CueEditClearAssignmentOutgoing
  | CueEditDiscardChangesOutgoing

export interface CueEditSessionStarted {
  type: 'cueEdit.sessionStarted'
  cueId: number
  mode: 'LIVE' | 'BLIND'
}

export interface CueEditSessionEnded {
  type: 'cueEdit.sessionEnded'
  cueId: number
}

export interface CueEditAssignmentChanged {
  type: 'cueEdit.assignmentChanged'
  cueId: number
  targetType: 'fixture' | 'group'
  targetKey: string
  propertyName: string
  value: string
}

export interface CueEditAssignmentCleared {
  type: 'cueEdit.assignmentCleared'
  cueId: number
  targetType: 'fixture' | 'group'
  targetKey: string
  propertyName: string
}

export interface CueEditChangesDiscarded {
  type: 'cueEdit.changesDiscarded'
  cueId: number
}

export interface CueEditError {
  type: 'cueEdit.error'
  cueId: number | null
  message: string
}

export type CueEditIncomingMessage =
  | CueEditSessionStarted
  | CueEditSessionEnded
  | CueEditAssignmentChanged
  | CueEditAssignmentCleared
  | CueEditChangesDiscarded
  | CueEditError

export interface CueEditWsApi {
  send(message: CueEditOutgoingMessage): void
  subscribe(fn: (message: CueEditIncomingMessage) => void): Subscription
}

export function createCueEditWsApi(conn: InternalApiConnection): CueEditWsApi {
  const incoming = createWsSubscribable<CueEditIncomingMessage>()

  conn.subscribe((evType, ev) => {
    if (evType !== 'message' || !(ev instanceof MessageEvent)) return
    // Fast path: skip JSON.parse for the vast majority of messages (channelState, fxState, …)
    // that don't contain a cueEdit.* discriminator.
    if (typeof ev.data !== 'string' || ev.data.indexOf('"cueEdit.') === -1) return
    let parsed: unknown
    try {
      parsed = JSON.parse(ev.data)
    } catch {
      return
    }
    if (!parsed || typeof parsed !== 'object') return
    const t = (parsed as Record<string, unknown>).type
    if (typeof t !== 'string' || !t.startsWith('cueEdit.')) return
    incoming.notify(parsed as CueEditIncomingMessage)
  })

  return {
    send(message) {
      conn.send(JSON.stringify(message))
    },
    subscribe: incoming.api.subscribe,
  }
}
