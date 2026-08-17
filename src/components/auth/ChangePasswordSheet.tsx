import { useState } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { formatError } from "@/lib/formatError"
import {
  useChangePasswordMutation,
  useRevokeOtherSessionsMutation,
  useSessionsQuery,
  type SessionInfo,
} from "@/store/auth"
import { MIN_PASSWORD_LENGTH } from "@/lib/passwordPolicy"

// The raw User-Agent is unreadable in a list. Pull out the browser and platform,
// which is all anyone needs to recognise "that's my laptop" vs "that's the desk".
function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "Unknown device"
  const browser =
    /Firefox\/[\d.]+/.test(userAgent) ? "Firefox"
    : /Edg\//.test(userAgent) ? "Edge"
    : /OPR\//.test(userAgent) ? "Opera"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Safari\//.test(userAgent) ? "Safari"
    : null
  const platform =
    /iPhone|iPad/.test(userAgent) ? "iOS"
    : /Android/.test(userAgent) ? "Android"
    : /Mac OS X/.test(userAgent) ? "macOS"
    : /Windows/.test(userAgent) ? "Windows"
    : /Linux/.test(userAgent) ? "Linux"
    : null
  if (browser && platform) return `${browser} on ${platform}`
  return browser ?? platform ?? "Unknown device"
}

function SessionRow({ session }: { session: SessionInfo }) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm">{describeUserAgent(session.userAgent)}</p>
        <p className="text-xs text-muted-foreground">
          Last active {new Date(session.lastSeenAtMs).toLocaleString()}
          {/* Named because a QR sign-in is the one entry here nobody typed a password for:
              if a device you don't recognise came in that way, this row is where you find
              out. */}
          {session.createdVia === "QR" && " · signed in by QR from the desk"}
        </p>
      </div>
      {session.current && <Badge variant="secondary">This device</Badge>}
    </li>
  )
}

export function ChangePasswordSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)

  const [changePassword, { isLoading }] = useChangePasswordMutation()
  const [revokeOthers, { isLoading: isRevoking }] = useRevokeOtherSessionsMutation()
  const {
    data: sessions,
    isLoading: isLoadingSessions,
    isError: sessionsFailed,
  } = useSessionsQuery(undefined, { skip: !open })

  // Deliberately `undefined` until the list actually arrives: a count of 0 read off
  // a missing list would render "No other devices signed in" — a claim we can't make
  // while loading or after a failure — and disable the one control that acts on it.
  const otherSessionCount = sessions?.filter((s) => !s.current).length
  const mismatch = confirm !== "" && newPassword !== confirm
  const canSubmit =
    currentPassword !== "" &&
    newPassword.length >= MIN_PASSWORD_LENGTH &&
    newPassword === confirm &&
    !isLoading

  const reset = () => {
    setCurrentPassword("")
    setNewPassword("")
    setConfirm("")
    setError(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const handleSave = async () => {
    if (!canSubmit) return
    setError(null)
    try {
      await changePassword({ currentPassword, newPassword }).unwrap()
    } catch (err) {
      setError(formatError(err))
      return
    }
    // The backend revokes every *other* session on a password change, keeping this
    // one — so the operator who just changed it isn't logged out of the desk.
    toast.success("Password changed", {
      description: "You've been signed out on any other device.",
    })
    reset()
    onOpenChange(false)
  }

  const handleRevokeOthers = async () => {
    try {
      await revokeOthers().unwrap()
    } catch {
      // Reported by errorToastMiddleware.
      return
    }
    toast.success("Signed out everywhere else")
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Change password</SheetTitle>
        </SheetHeader>
        <SheetBody>
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {mismatch && <p className="text-sm text-destructive">Passwords don&apos;t match.</p>}
          </div>

          <div className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-medium">Signed in on</h3>
            {isLoadingSessions && <p className="text-sm text-muted-foreground">Loading…</p>}
            {sessionsFailed && (
              <p className="text-sm text-destructive">
                Couldn&apos;t load your signed-in devices.
              </p>
            )}
            {sessions && (
              <ul className="space-y-2">
                {sessions.map((session) => (
                  <SessionRow key={session.id} session={session} />
                ))}
              </ul>
            )}
            <Button
              variant="outline"
              className="w-full"
              // Enabled whenever the count is unknown: refusing to act on a list we
              // failed to load would strand an admin who came here precisely to kick
              // another device off. The backend is the real authority either way.
              disabled={otherSessionCount === 0 || isRevoking}
              onClick={handleRevokeOthers}
            >
              {isRevoking && <Loader2 className="size-4 animate-spin" />}
              {otherSessionCount === 0
                ? "No other devices signed in"
                : otherSessionCount === undefined
                  ? "Sign out everywhere else"
                  : `Sign out everywhere else (${otherSessionCount})`}
            </Button>
          </div>
        </SheetBody>
        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSubmit}>
            {isLoading && <Loader2 className="size-4 animate-spin" />}
            Change password
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
