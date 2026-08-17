import { restApi } from "./restApi"
import { lightingApi } from "../api/lightingApi"
import { store } from "./index"

// Desk-local user accounts. Users belong to the *machine*, not to a project — they
// are never exported, cloned or cloud-synced. The session lives in an httpOnly
// cookie, so nothing here can read it: `GET /auth/status` is the only source of
// truth about who (if anyone) is signed in.

export type UserRole = 'ADMIN' | 'OPERATOR'

export interface AuthUser {
  uuid: string
  username: string
  displayName: string
  role: UserRole
}

export interface AuthStatus {
  /** No users exist yet. The backend is bootstrap-open: the API is unauthenticated. */
  setupRequired: boolean
  authenticated: boolean
  // Explicitly `null` (not absent) when signed out — the backend serialises the
  // field either way, so consumers must test the value, not `'user' in status`.
  user?: AuthUser | null
}

export interface SessionInfo {
  id: number
  createdAtMs: number
  lastSeenAtMs: number
  userAgent: string | null
  /** The session this browser is using. It survives "sign out everywhere else". */
  current: boolean
}

export interface LoginRequest {
  username: string
  password: string
}

export interface SetupRequest {
  username: string
  displayName: string
  password: string
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

// Shared by `login` and `setup`: both mint a session cookie, so both have to
// re-handshake the socket. It may have been opened before we had an identity
// (bootstrap-open), or closed with 4401 when the previous session died. `force`
// because in the bootstrap-open case the socket is still OPEN and a plain
// reconnect() no-ops, which would leave an anonymous socket streaming that Session
// 3's revocation flow has no session hash to revoke. Also used by `logout`, where
// the point is the reverse: drop the socket that still holds the departing session.
//
// The catch is load-bearing, not defensive: `queryFulfilled` rejects on a failed
// login and an uncaught rejection here surfaces as an unhandled promise rejection.
async function rehandshakeSocketOnSuccess(
  _arg: unknown,
  { queryFulfilled }: { queryFulfilled: Promise<unknown> },
) {
  try {
    await queryFulfilled
  } catch {
    return
  }
  lightingApi.status.reconnect(true)
}

export const authApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    authStatus: build.query<AuthStatus, void>({
      query: () => 'auth/status',
      providesTags: ['Auth'],
    }),

    // Both entry points mint a session cookie, so both have to re-handshake the
    // socket: it may have been opened before we had an identity (bootstrap-open),
    // or closed with 4401 when the previous session died. `force` because in the
    // bootstrap-open case the socket is still OPEN and a plain reconnect() no-ops,
    // which would leave an anonymous socket streaming that nothing can revoke.
    //
    // Both invalidate only on success and reconnect only on success: a rejected
    // login is a typo, and nothing about the session — or the socket — changed.
    // RTK Query applies a static `invalidatesTags` to failed mutations as well, so
    // the error has to be checked explicitly.
    login: build.mutation<AuthStatus, LoginRequest>({
      query: (body) => ({ url: 'auth/login', method: 'POST', body }),
      invalidatesTags: (_result, error) => (error ? [] : ['Auth', 'AuthSessions']),
      onQueryStarted: rehandshakeSocketOnSuccess,
    }),
    setup: build.mutation<AuthStatus, SetupRequest>({
      query: (body) => ({ url: 'auth/setup', method: 'POST', body }),
      invalidatesTags: (_result, error) => (error ? [] : ['Auth', 'AuthSessions']),
      onQueryStarted: rehandshakeSocketOnSuccess,
    }),

    // Logging out has to re-handshake for the same reason logging in does, and it
    // matters more: the backend only checks identity at the WS handshake (live
    // revocation is Session 3), and `lightingApi` is a module-level singleton that
    // unmounting the router does not touch. Without this the socket authenticated
    // as the operator who just left stays open and streaming behind the login
    // screen. The replacement carries no cookie, so the server closes it 4401 and
    // `internalApi` leaves it closed.
    logout: build.mutation<void, void>({
      query: () => ({ url: 'auth/logout', method: 'POST' }),
      invalidatesTags: ['Auth', 'AuthSessions'],
      onQueryStarted: rehandshakeSocketOnSuccess,
    }),

    // Revokes the caller's *other* sessions server-side but keeps this one, so the
    // session list changes without this browser being logged out.
    changePassword: build.mutation<void, ChangePasswordRequest>({
      query: (body) => ({ url: 'auth/password', method: 'PUT', body }),
      invalidatesTags: ['AuthSessions'],
    }),

    sessions: build.query<SessionInfo[], void>({
      query: () => 'auth/sessions',
      providesTags: ['AuthSessions'],
    }),
    revokeOtherSessions: build.mutation<void, void>({
      query: () => ({ url: 'auth/sessions', method: 'DELETE' }),
      invalidatesTags: ['AuthSessions'],
    }),
  }),
  overrideExisting: false,
})

export const {
  useAuthStatusQuery,
  useLoginMutation,
  useSetupMutation,
  useLogoutMutation,
  useChangePasswordMutation,
  useSessionsQuery,
  useRevokeOtherSessionsMutation,
} = authApi

// The socket was rejected (close code 4401), which means this browser's session is
// gone — most likely revoked from another device or by an admin. Invalidating `Auth`
// makes AuthGate re-check and drop to the login screen, instead of the app sitting
// there with a dead socket. Mirrors the WS→cache bridges in ./bootStatus.ts.
lightingApi.auth.subscribeUnauthenticated(() => {
  store.dispatch(restApi.util.invalidateTags(['Auth']))
})
