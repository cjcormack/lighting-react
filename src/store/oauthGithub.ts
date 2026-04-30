import { restApi } from "./restApi"

// ─── Types ─────────────────────────────────────────────────────────────

/**
 * Install-wide GitHub OAuth identity. Returned by `GET /oauth/github/identity`.
 *
 * `oauthConfigured` is independent of `connected` — it's `true` whenever
 * `sync.oauth.github.clientId` is set in the install's `local.conf`. The UI uses
 * it to decide whether to show the "Connect GitHub" path at all (otherwise only
 * the Advanced/PAT entry is offered).
 */
export interface OAuthIdentity {
  connected: boolean
  oauthConfigured: boolean
  login?: string | null
  githubUserId?: number | null
  accessExpiresAtMs?: number | null
  refreshExpiresAtMs?: number | null
  connectedAtMs?: number | null
}

export interface GithubRepo {
  fullName: string
  name: string
  owner: string
  private: boolean
  defaultBranch: string
  htmlUrl: string
  cloneUrl: string
  description: string | null
  pushPermission: boolean
}

export interface CreateRepoBody {
  name: string
  private: boolean
  description?: string | null
}

export interface DeviceFlowStartResponse {
  deviceCode: string
  userCode: string
  verificationUri: string
  /** Lifetime in seconds. */
  expiresIn: number
  /** Recommended polling interval in seconds. */
  interval: number
}

export type DeviceFlowStatus = "PENDING" | "SLOW_DOWN" | "DONE" | "EXPIRED" | "DENIED"

export interface DeviceFlowPollResponse {
  status: DeviceFlowStatus
  login?: string | null
}

// ─── Endpoints ─────────────────────────────────────────────────────────

/**
 * GitHub OAuth identity + repo discovery. Identity is install-wide (one signed-in
 * GitHub user shared across every project); repo lookup honours the App's
 * per-installation permission grant.
 */
export const oauthGithubApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    oauthGithubIdentity: build.query<OAuthIdentity, void>({
      query: () => 'oauth/github/identity',
      providesTags: ['OAuthIdentity'],
    }),
    disconnectOAuthGithub: build.mutation<void, void>({
      query: () => ({
        url: 'oauth/github/identity',
        method: 'DELETE',
      }),
      // Disconnect removes the identity AND wipes the install's repo permissions,
      // so the cached repo list is no longer accurate.
      invalidatesTags: ['OAuthIdentity', 'OAuthRepos'],
    }),
    listGithubRepos: build.query<
      GithubRepo[],
      { query?: string | null; page?: number; perPage?: number }
    >({
      query: (args) => ({
        url: 'oauth/github/repositories',
        params: {
          query: args.query?.trim() ? args.query.trim() : undefined,
          page: args.page,
          perPage: args.perPage,
        },
      }),
      providesTags: ['OAuthRepos'],
    }),
    createGithubRepo: build.mutation<GithubRepo, CreateRepoBody>({
      query: (body) => ({
        url: 'oauth/github/repositories',
        method: 'POST',
        body,
      }),
      // A new repo widens the installation's repo set; refresh the list cache.
      invalidatesTags: ['OAuthRepos'],
    }),
    startGithubDeviceFlow: build.mutation<DeviceFlowStartResponse, void>({
      query: () => ({
        url: 'oauth/github/device/start',
        method: 'POST',
      }),
    }),
    pollGithubDeviceFlow: build.mutation<DeviceFlowPollResponse, { deviceCode: string }>({
      query: (body) => ({
        url: 'oauth/github/device/poll',
        method: 'POST',
        body,
      }),
      // Successful poll establishes the identity; let the next render see it.
      invalidatesTags: (_result, _err) => ['OAuthIdentity'],
    }),
  }),
  overrideExisting: false,
})

export const {
  useOauthGithubIdentityQuery,
  useDisconnectOAuthGithubMutation,
  useListGithubReposQuery,
  useCreateGithubRepoMutation,
  useStartGithubDeviceFlowMutation,
  usePollGithubDeviceFlowMutation,
} = oauthGithubApi
