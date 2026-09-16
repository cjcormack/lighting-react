import { InternalApiConnection, InternalEventType } from './internalApi'
import { Subscription } from './subscription'
import { createWsSubscribable } from './wsSubscriptionFactory'
import { sendGesture } from './wsGesture'
import { Status } from './statusApi'

/**
 * The `windows.*` family — the desk's registry of signed-in browser windows, and the three
 * commands one window sends another (multi-screen plan §3.4; lighting7 `plugins/WindowsSocket.kt`,
 * which is the wire contract wherever this comment and the plan's sketch differ).
 *
 * **A row per socket, keyed by the socket.** The desk mints each row's `id` from the connection and
 * that is what every command addresses and what a `selection.state` `source` carries; the
 * `windowId` a row also carries is this tab's own `sessionStorage` uuid (`lib/windowIdentity.ts`),
 * and is how a client recognises its own row across a reload and a reconnect. A duplicated tab
 * copies its storage, so two rows can share a `windowId`; they never share an `id`.
 *
 * **The announce carries exactly `windowId`, `name`, `view`, `fullscreen`, `follows`.** The desk's
 * `Json` is bare — no `ignoreUnknownKeys` — so one extra key makes the whole frame undeserializable
 * and it is dropped with a server-side log line only. The symptom is a window that never appears in
 * `windows.state`, which is why [WindowAnnounce] is spelled out field by field below and
 * `windowsApi.test.ts` pins the key set. `id` and `user` are the server's to say (D7's rule applied
 * again): a window that could send either could claim to be another window or another operator.
 *
 * **The announce is re-sent on every `open`.** It is the second legitimate `open` branch in this
 * tree (`speedMastersWsApi`'s beat re-requests are the first), and for the same reason: it re-sends
 * what the *server* forgot. The registry keys by socket and a reconnect is a new socket, so a
 * reconnected tab has no row until it says so again. It re-sends only that — no state request,
 * since `windows.state` is a `StateFlow` and the desk pushes the snapshot on every connect.
 *
 * **It is handled only once the show is warm.** The frame sits in the socket's incoming channel
 * through boot, so `windows.state` arrives empty behind the boot overlay and fills itself when the
 * show is ready. There is deliberately no retry timer; the connect burst already carries it.
 *
 * **The commands are rebroadcast to every socket, the sender included** (D11), verbatim. A handler's
 * first act is to compare `targetId` with this window's row id; an id that is not this window's
 * matches nothing, and a command whose target is disconnected is simply lost — visible as that
 * row's `view` not moving (`FU-WINDOWS-SHOW-OFFLINE`). `windows.rename` is **not** applied
 * server-side: the target renames itself and re-announces, which is what makes the new name
 * survive that tab's reload.
 */
export interface DeskWindow {
  /** Socket-minted; what commands address and what `selection.state`'s `source.id` names. */
  id: string
  /** Client-minted, from that tab's `sessionStorage`; not unique across a duplicated tab. */
  windowId: string
  name: string
  /** The route path that window is showing. */
  view: string
  fullscreen: boolean
  follows: boolean
  /** The authenticated display name behind that socket; null on a bootstrap-open desk. */
  user: string | null
}

/** Exactly the five keys the desk's `WindowsAnnounceInMessage` declares, and no more. */
export interface WindowAnnounce {
  windowId: string
  name: string
  view: string
  fullscreen: boolean
  follows: boolean
}

export type WindowCommand =
  | { type: 'show'; targetId: string; view: string }
  | { type: 'rename'; targetId: string; name: string }
  | { type: 'fullscreen'; targetId: string; on: boolean }

export interface WindowsWsApi {
  /** Every signed-in window, on connect and on every change. */
  subscribe(fn: (windows: DeskWindow[]) => void): Subscription
  /** The last state frame, or null before the first — for an RTK Query `queryFn` seeding its entry. */
  getState(): DeskWindow[] | null
  /** The three commands, as rebroadcast — this window's own included. */
  subscribeCommands(fn: (command: WindowCommand) => void): Subscription
  /**
   * Say what this window is. Remembered and re-sent on every `open`; sent now if the socket is up,
   * and silently *not* otherwise, because a socket that is down will re-send it on its way back up
   * — this is not an operator gesture, so it does not toast.
   */
  announce(payload: WindowAnnounce): void
  /** The payload of the last announce, for a test or a caller that wants to re-send a variant. */
  lastAnnounce(): WindowAnnounce | null
  show(targetId: string, view: string): void
  rename(targetId: string, name: string): void
  fullscreen(targetId: string, on: boolean): void
}

type WindowsInMessage =
  | { type: 'windows.state'; windows: unknown }
  | { type: 'windows.show'; targetId: unknown; view: unknown }
  | { type: 'windows.rename'; targetId: unknown; name: unknown }
  | { type: 'windows.fullscreen'; targetId: unknown; on: unknown }

/** Read one registry row, or null for anything that is not one. */
export function parseDeskWindow(raw: unknown): DeskWindow | null {
  if (raw == null || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (
    typeof r.id !== 'string' ||
    typeof r.windowId !== 'string' ||
    typeof r.name !== 'string' ||
    typeof r.view !== 'string'
  ) {
    return null
  }
  return {
    id: r.id,
    windowId: r.windowId,
    name: r.name,
    view: r.view,
    // The desk's Json drops defaults, so an absent field is the declared default.
    fullscreen: r.fullscreen === true,
    follows: r.follows !== false,
    user: typeof r.user === 'string' ? r.user : null,
  }
}

function parseCommand(message: Exclude<WindowsInMessage, { type: 'windows.state' }>): WindowCommand | null {
  const { targetId } = message
  if (typeof targetId !== 'string') return null
  switch (message.type) {
    case 'windows.show':
      return typeof message.view === 'string' ? { type: 'show', targetId, view: message.view } : null
    case 'windows.rename':
      return typeof message.name === 'string' ? { type: 'rename', targetId, name: message.name } : null
    case 'windows.fullscreen':
      return typeof message.on === 'boolean' ? { type: 'fullscreen', targetId, on: message.on } : null
  }
}

/** The frame, with the five keys and nothing else — see the module comment for why that matters. */
export function announceFrame(payload: WindowAnnounce): Record<string, unknown> {
  return {
    type: 'windows.announce',
    windowId: payload.windowId,
    name: payload.name,
    view: payload.view,
    fullscreen: payload.fullscreen,
    follows: payload.follows,
  }
}

export function createWindowsWsApi(conn: InternalApiConnection): WindowsWsApi {
  const state = createWsSubscribable<DeskWindow[]>()
  const commands = createWsSubscribable<WindowCommand>()
  let last: DeskWindow[] | null = null
  let announced: WindowAnnounce | null = null

  const send = () => {
    if (announced == null || conn.readyState() !== Status.OPEN) return
    conn.send(JSON.stringify(announceFrame(announced)))
  }

  conn.subscribe((evType, _ev, frame) => {
    if (evType === InternalEventType.open) {
      // The one thing this branch owes: the row the server lost with the old socket.
      send()
      return
    }
    if (evType !== InternalEventType.message) return
    const message = frame as WindowsInMessage | null
    if (message == null || typeof message !== 'object') return
    if (message.type === 'windows.state') {
      const rows = Array.isArray(message.windows)
        ? message.windows.map(parseDeskWindow).filter((w): w is DeskWindow => w != null)
        : []
      last = rows
      state.notify(rows)
      return
    }
    if (
      message.type === 'windows.show' ||
      message.type === 'windows.rename' ||
      message.type === 'windows.fullscreen'
    ) {
      const command = parseCommand(message)
      if (command != null) commands.notify(command)
    }
  })

  return {
    subscribe: (fn) => {
      const sub = state.api.subscribe(fn)
      if (last != null) fn(last)
      return sub
    },
    getState: () => last,
    subscribeCommands: commands.api.subscribe,
    announce: (payload) => {
      announced = { ...payload }
      send()
    },
    lastAnnounce: () => announced,
    show: (targetId, view) => sendGesture(conn, { type: 'windows.show', targetId, view }),
    rename: (targetId, name) => sendGesture(conn, { type: 'windows.rename', targetId, name }),
    fullscreen: (targetId, on) => sendGesture(conn, { type: 'windows.fullscreen', targetId, on }),
  }
}
