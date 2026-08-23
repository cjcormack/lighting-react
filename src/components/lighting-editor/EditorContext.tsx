import { createContext, useContext, useMemo, type ReactNode } from 'react'

/**
 * `kind: 'live'` writes go to Layer 4 (direct stage).
 *
 * **There is no `cue` arm.** A cue is read-only and edited by Include, so that there is exactly one
 * place values are set (D2 of the desk-simplification plan). Session 2a made that true and left the
 * arm in place, because 2b — the Run/Show merge — was where it would be decided whether an unlocked
 * cue row got editable cells back. It did not: giving a cue row cells would reopen the question D2
 * settled and make a cue and the programmer two places again. So the arm, its four session
 * helpers, `api/cueEditWsApi.ts` and the fifteen `kind === 'cue'` branches across five hooks were
 * removed in 2b.
 *
 * **The `409 CUE_EDIT_SESSION_OPEN` handling stays** — in `RecordSheet`, `UpdateDialog` and
 * `store/programmerOps.ts`. The backend protocol is still live and another client can hold a
 * session, so that response is a real thing this client must handle; it simply never *opens* one.
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
  const lookId = value.kind === 'look' ? value.id : value.kind === 'lookLayer' ? value.lookId : null
  const layerId = value.kind === 'lookLayer' ? value.layerId : null
  // `value` is deliberately not a dependency: depending on it is exactly the
  // per-render rebroadcast this memo exists to absorb.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => value, [kind, lookId, layerId])
  return <EditorContext.Provider value={stable}>{children}</EditorContext.Provider>
}

export function useEditorContext(): EditorContextValue {
  return useContext(EditorContext)
}
