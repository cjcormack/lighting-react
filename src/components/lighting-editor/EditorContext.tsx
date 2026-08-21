import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { lightingApi } from '../../api/lightingApi'

/**
 * `kind: 'live'` writes go to Layer 4 (direct stage); `kind: 'cue'` writes route through
 * `cueEdit.*` so the backend persists them as Layer 3 property assignments on the active
 * edit session. `mode` distinguishes stage-synced (`live`) from persist-only (`blind`).
 *
 * `kind: 'look'` writes reach neither: they land in `LookDraftContext`, because the Look editor
 * works against a synthetic fixture and its rows are deferred — there is no head on stage to
 * write to until a layer supplies one.
 */
export type EditorContextValue =
  | { kind: 'live' }
  | { kind: 'cue'; id: number; mode: 'live' | 'blind' }
  | { kind: 'look'; id: number }

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
  const kind = value.kind
  const cueId = value.kind === 'cue' ? value.id : null
  const cueMode = value.kind === 'cue' ? value.mode : null
  const lookId = value.kind === 'look' ? value.id : null
  // `value` is deliberately not a dependency: depending on it is exactly the
  // per-render rebroadcast this memo exists to absorb.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => value, [kind, cueId, cueMode, lookId])
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
