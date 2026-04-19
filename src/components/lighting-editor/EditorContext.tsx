import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { lightingApi } from '../../api/lightingApi'

/**
 * `kind: 'live'` writes go to Layer 4 (direct stage); `kind: 'cue'` writes route through
 * `cueEdit.*` so the backend persists them as Layer 3 property assignments on the active
 * edit session. `mode` distinguishes stage-synced (`live`) from persist-only (`blind`).
 */
export type EditorContextValue =
  | { kind: 'live' }
  | { kind: 'cue'; id: number; mode: 'live' | 'blind' }
  | { kind: 'preset'; id: number }

const defaultValue: EditorContextValue = { kind: 'live' }

const EditorContext = createContext<EditorContextValue>(defaultValue)

export function EditorContextProvider({
  value,
  children,
}: {
  value: EditorContextValue
  children: ReactNode
}) {
  // Tolerate callers that pass a fresh object literal on every render — only rebroadcast
  // when a field consumers actually care about changes.
  const stable = useMemo(
    () => value,
    [
      value.kind,
      value.kind === 'cue' ? value.id : null,
      value.kind === 'cue' ? value.mode : null,
      value.kind === 'preset' ? value.id : null,
    ]
  )
  return <EditorContext.Provider value={stable}>{children}</EditorContext.Provider>
}

export function useEditorContext(): EditorContextValue {
  return useContext(EditorContext)
}

// Session-lifecycle helpers. Not hooks — callers invoke them on the shared WS connection
// directly (typically from the CueEditor's mount/unmount and mode-toggle handlers).

export function beginCueEditSession(cueId: number, mode: 'live' | 'blind'): void {
  lightingApi.cueEdit.send({ type: 'cueEdit.beginEdit', cueId, mode })
}

export function endCueEditSession(cueId: number): void {
  lightingApi.cueEdit.send({ type: 'cueEdit.endEdit', cueId })
}

export function setCueEditMode(cueId: number, mode: 'live' | 'blind'): void {
  lightingApi.cueEdit.send({ type: 'cueEdit.setMode', cueId, mode })
}

export function discardCueEditChanges(cueId: number): void {
  lightingApi.cueEdit.send({ type: 'cueEdit.discardChanges', cueId })
}
