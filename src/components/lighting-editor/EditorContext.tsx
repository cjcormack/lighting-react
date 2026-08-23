import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { lightingApi } from '../../api/lightingApi'

/**
 * `kind: 'live'` writes go to Layer 4 (direct stage); `kind: 'cue'` writes route through
 * `cueEdit.*` so the backend persists them as Layer 3 property assignments on the active
 * edit session. `mode` distinguishes stage-synced (`live`) from persist-only (`blind`).
 *
 * **Nothing provides the `cue` arm any more.** Session 2a made a cue read-only — it is edited by
 * Include, so that there is exactly one place values are set — and `CueCardEditor` was the only
 * thing that ever opened a `cueEdit` session or published this arm. Every `ctx.kind === 'cue'`
 * branch below and in the five hooks that read this is therefore currently unreachable.
 *
 * Kept rather than deleted, deliberately. The backend protocol is live and another client can still
 * hold a session, so the `409 CUE_EDIT_SESSION_OPEN` handling in `RecordSheet` and `UpdateDialog`
 * is *not* dead and must stay. And session 2b — the Run/Show merge — is where it is decided whether
 * an unlocked cue row gets editable cells back; ripping fifteen branches out of five hooks in the
 * change that made them unreachable, only to consider putting them back one session later, is churn
 * with a real chance of a mistake in it. If 2b settles on read-only for good, this is the arm to
 * remove, and `api/cueEditWsApi.ts` goes with it.
 *
 * `kind: 'look'` writes reach neither: they land in `LookDraftContext`, because the Look editor
 * works against a synthetic fixture and its rows are deferred — there is no head on stage to
 * write to until a layer supplies one.
 *
 * `kind: 'lookLayer'` is the programmer grid focused on one of its Look layers. **Not the same as
 * `look`**, and the two must not be merged: `look` is the library editor's draft over *deferred*
 * rows keyed by property name alone, while this writes *bound* rows keyed by (fixture, property)
 * and does so live — the save republishes every cue layering that Look, which is the entire point
 * of composing in place. It carries both ids because the layer says which stack line is focused
 * and the Look says what gets written.
 */
export type EditorContextValue =
  | { kind: 'live' }
  | { kind: 'cue'; id: number; mode: 'live' | 'blind' }
  | { kind: 'look'; id: number }
  | { kind: 'lookLayer'; layerId: number; lookId: number }

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
  const lookId = value.kind === 'look' ? value.id : value.kind === 'lookLayer' ? value.lookId : null
  const layerId = value.kind === 'lookLayer' ? value.layerId : null
  // `value` is deliberately not a dependency: depending on it is exactly the
  // per-render rebroadcast this memo exists to absorb.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => value, [kind, cueId, cueMode, lookId, layerId])
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
