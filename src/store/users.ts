import { restApi } from './restApi'
import type { UserRole } from './auth'

// Admin-only desk-account management. Distinct from ./auth: that module is "who am I and
// how do I sign in", this one is "who else is allowed to" — a different tag family so
// editing the user list never churns the caller's own session/auth cache.

export interface DeskUser {
  id: number
  uuid: string
  username: string
  displayName: string
  role: UserRole
  disabled: boolean
  createdAtMs: number
  lastLoginAtMs?: number | null
}

export interface NewUserRequest {
  username: string
  displayName: string
  role: UserRole
  password: string
}

// Every field optional: an absent field means "leave it alone", not "clear it" — the
// backend applies this as a partial patch, so sending `disabled: false` on every edit
// would silently re-enable a user the admin never meant to touch.
export interface UpdateUserRequest {
  displayName?: string
  role?: UserRole
  disabled?: boolean
}

export interface ResetTokenResponse {
  id: number
  url: string
  alternateUrls: string[]
  expiresAtMs: number
  username: string
  displayName: string
}

export type ResetTokenStatus = 'PENDING' | 'USED' | 'EXPIRED' | 'CANCELLED'

export interface ResetTokenStatusInfo {
  status: ResetTokenStatus
  expiresAtMs: number
}

export const usersApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    users: build.query<DeskUser[], void>({
      query: () => 'users',
      providesTags: ['UserList'],
    }),

    user: build.query<DeskUser, { userId: number }>({
      query: ({ userId }) => `users/${userId}`,
      providesTags: (_result, _error, { userId }) => [{ type: 'User', id: userId }],
    }),

    // A duplicate username answers 409 (the backend leans on the unique index rather
    // than a pre-check, so it's race-proof) and a short password 400. Both are ordinary
    // flow steps rendered inline in CreateUserSheet, not toast material.
    createUser: build.mutation<DeskUser, NewUserRequest>({
      query: (body) => ({ url: 'users', method: 'POST', body }),
      invalidatesTags: (result) => (result == null ? [] : ['UserList']),
    }),

    // 409 `LAST_ADMIN` (demoting/disabling the only enabled admin) and `SELF_TARGET`
    // (disabling yourself) are ordinary flow steps rendered inline in UserDetailSheet.
    // A disabling edit also revokes that user's sessions and closes their socket
    // server-side (Session 3.5) — nothing for this cache to reflect beyond the row
    // itself flipping to disabled.
    updateUser: build.mutation<DeskUser, { userId: number } & UpdateUserRequest>({
      query: ({ userId, ...body }) => ({ url: `users/${userId}`, method: 'PUT', body }),
      // `Auth` too, because the edited account may be the caller's own: an admin who
      // demotes themselves is an OPERATOR from the next request onwards, and the backend
      // answers a role failure with 403 — which `restApi`'s interceptor deliberately
      // ignores (only 401 means "session gone"). Without re-reading `auth/status` here the
      // sidebar, the Users tab and the user menu would keep offering admin surfaces that
      // now 403. One extra status fetch per user edit, and edits are rare.
      invalidatesTags: (result, _error, { userId }) =>
        result == null ? [] : ['UserList', { type: 'User', id: userId }, 'Auth'],
    }),

    // Same LAST_ADMIN/SELF_TARGET guard as updateUser, and the same session/socket
    // teardown on success.
    deleteUser: build.mutation<void, { userId: number }>({
      query: ({ userId }) => ({ url: `users/${userId}`, method: 'DELETE' }),
      // The per-user entry goes too, not just the list: SQLite hands out the deleted row's
      // id again for the next account created after it, and a surviving cache entry under
      // that id would seed the detail sheet with the *deleted* user's name and role — an
      // admin could then save those onto the new account.
      invalidatesTags: (_result, error, { userId }) =>
        error ? [] : ['UserList', { type: 'User', id: userId }],
    }),

    // Direct set for "the user is standing next to you". No list field changes, so
    // nothing to invalidate — it only revokes that user's sessions server-side, which
    // this cache has no representation of.
    setUserPassword: build.mutation<void, { userId: number; newPassword: string }>({
      query: ({ userId, newPassword }) => ({
        url: `users/${userId}/password`,
        method: 'PUT',
        body: { newPassword },
      }),
    }),

    // Minting cancels that user's outstanding tokens server-side, but ResetQrSheet holds
    // the freshly-minted token in local state and polls `resetTokenStatus` directly, so
    // there is no list this needs to invalidate.
    createResetToken: build.mutation<ResetTokenResponse, { userId: number }>({
      query: ({ userId }) => ({ url: `users/${userId}/reset-tokens`, method: 'POST' }),
    }),

    resetTokenStatus: build.query<ResetTokenStatusInfo, { userId: number; tokenId: number }>({
      query: ({ userId, tokenId }) => `users/${userId}/reset-tokens/${tokenId}`,
      providesTags: (_result, _error, { tokenId }) => [{ type: 'ResetToken', id: tokenId }],
    }),

    // Fired when the admin closes the QR sheet before it's redeemed. Nothing to
    // invalidate: the sheet is going away, not re-reading the status it just cancelled.
    cancelResetToken: build.mutation<void, { userId: number; tokenId: number }>({
      query: ({ userId, tokenId }) => ({
        url: `users/${userId}/reset-tokens/${tokenId}`,
        method: 'DELETE',
      }),
    }),
  }),
  overrideExisting: false,
})

export const {
  useUsersQuery,
  useUserQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
  useSetUserPasswordMutation,
  useCreateResetTokenMutation,
  useResetTokenStatusQuery,
  useCancelResetTokenMutation,
} = usersApi
