import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Github, LogOut, Loader2 } from "lucide-react"
import {
  useDisconnectOAuthGithubMutation,
  useOauthGithubIdentityQuery,
} from "@/store/oauthGithub"
import { formatError } from "@/lib/formatError"
import { DeviceFlowModal } from "./DeviceFlowModal"

/**
 * Header row for the cloud-sync configuration card. Shows the connected GitHub user
 * (or a "Connect GitHub" call-to-action) and exposes the device-flow fallback link
 * underneath.
 *
 * The web flow is initiated by a normal `<a>` to the backend's `/oauth/github/start`
 * route — no SPA navigation trickery, the backend sets the CSRF cookie and redirects.
 */
// Backend refreshes at 60s remaining; this badge stays on a few minutes earlier
// so a sluggish refresh doesn't surprise the user.
const REFRESH_SOON_THRESHOLD_MS = 5 * 60 * 1000

export function IdentityRow({ projectId }: { projectId: number }) {
  const { data: identity, isLoading } = useOauthGithubIdentityQuery()
  const [disconnect, { isLoading: isDisconnecting }] = useDisconnectOAuthGithubMutation()
  const [deviceFlowOpen, setDeviceFlowOpen] = useState(false)

  if (isLoading || !identity) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Checking GitHub connection…
      </div>
    )
  }

  if (!identity.oauthConfigured) {
    return (
      <div className="text-xs text-muted-foreground">
        OAuth is not configured on this install. Use the Advanced section below to
        store a Personal Access Token, or set <code className="text-xs">sync.oauth.github</code>{" "}
        in <code className="text-xs">local.conf</code>.
      </div>
    )
  }

  const handleDisconnect = async () => {
    try {
      await disconnect().unwrap()
      toast.success("GitHub disconnected")
    } catch (err) {
      toast.error(`Disconnect failed: ${formatError(err)}`)
    }
  }

  // Web flow: hand the browser straight to the backend, which sets the CSRF cookie
  // and redirects to GitHub. The `projectId` query param tells the callback where
  // to bounce the user back to.
  const startUrl = `/api/rest/oauth/github/start?projectId=${encodeURIComponent(String(projectId))}`

  if (identity.connected) {
    const expiresIn = identity.accessExpiresAtMs
      ? Math.max(0, identity.accessExpiresAtMs - Date.now())
      : null
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Github className="size-4 shrink-0" />
          <span className="text-sm truncate">
            Connected as <strong>@{identity.login}</strong>
          </span>
          {expiresIn != null && expiresIn < REFRESH_SOON_THRESHOLD_MS && (
            <Badge variant="outline" className="text-[10px]">
              refreshing soon
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDisconnect}
          disabled={isDisconnecting}
        >
          <LogOut className="size-3.5 mr-1.5" />
          {isDisconnecting ? "Disconnecting…" : "Disconnect"}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Github className="size-4 shrink-0" />
          <span className="text-sm">Not connected to GitHub.</span>
        </div>
        <a href={startUrl}>
          <Button size="sm">
            <Github className="size-3.5 mr-1.5" />
            Connect GitHub
          </Button>
        </a>
      </div>
      <button
        type="button"
        onClick={() => setDeviceFlowOpen(true)}
        className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
      >
        Can&rsquo;t open a popup? Use a device code
      </button>
      <DeviceFlowModal open={deviceFlowOpen} onOpenChange={setDeviceFlowOpen} />
    </div>
  )
}
