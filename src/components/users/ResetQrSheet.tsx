import { useEffect, useRef, useState } from "react"
import QRCode from "react-qr-code"
import { AlertTriangle, Check, Copy, Loader2, RefreshCw } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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
  useCancelResetTokenMutation,
  useCreateResetTokenMutation,
  useResetTokenStatusQuery,
  type DeskUser,
  type ResetTokenResponse,
} from "@/store/users"

/** Matches the sheet's poll cadence to human patience: the admin is watching a phone. */
const POLL_INTERVAL_MS = 2000

function formatCountdown(msRemaining: number): string {
  const total = Math.max(0, Math.floor(msRemaining / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

/**
 * The QR half of the password reset flow: an admin mints a single-use link, the
 * locked-out user scans it on their phone and sets a new password, and this sheet flips to
 * a success state within a poll interval.
 *
 * Polling uses RTK Query's own `pollingInterval` rather than the hand-rolled
 * `setInterval` in `cloudSync/DeviceFlowModal` — that flow polls with a *mutation* (the
 * device-code grant is a POST) and had to schedule it itself; this one is a plain GET, so
 * the query can own its own cadence and stop when the sheet unmounts.
 */
export function ResetQrSheet({
  user,
  open,
  onOpenChange,
}: {
  /** Null while no row is selected — the sheet renders nothing until one is. */
  user: DeskUser | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [token, setToken] = useState<ResetTokenResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  /** Latched when the token reaches a terminal status; stops the poll. */
  const [settled, setSettled] = useState(false)

  const [createResetToken, { isLoading: isMinting }] = useCreateResetTokenMutation()
  const [cancelResetToken] = useCancelResetTokenMutation()

  const userId = user?.id
  // Held in a ref as well as in state so the unmount cleanup can cancel the live token
  // without re-running (and thus cancelling) every time the token changes.
  const liveToken = useRef<{ userId: number; tokenId: number } | null>(null)

  // Read after an await to tell "still on screen" from "closed while we were minting".
  // Assigned during render rather than in an effect so it is already correct for a mint
  // that resolves before effects flush.
  const openRef = useRef(open)
  openRef.current = open

  const { data: status } = useResetTokenStatusQuery(
    { userId: userId ?? 0, tokenId: token?.id ?? 0 },
    {
      skip: !open || userId == null || token == null,
      // Stop once the answer can't change again — USED / EXPIRED / CANCELLED are terminal,
      // and a sheet left open on a success message shouldn't keep asking about it.
      pollingInterval: settled ? 0 : POLL_INTERVAL_MS,
    },
  )
  const tokenStatus = status?.status ?? "PENDING"

  // A terminal status also means there is nothing left to cancel, so drop the ref
  // immediately — otherwise closing the sheet would fire a pointless DELETE.
  useEffect(() => {
    if (tokenStatus === "PENDING") return
    liveToken.current = null
    setSettled(true)
  }, [tokenStatus])

  const mint = async () => {
    if (userId == null) return
    setError(null)
    setCopied(false)
    try {
      const minted = await createResetToken({ userId }).unwrap()
      // The admin can close the sheet while this request is in flight, and the
      // close-cleanup below only cancels what `liveToken` pointed at *then* — which was
      // still null. Cancel it here instead: nobody has seen this URL, so a link left live
      // for fifteen minutes would be one nobody knows exists.
      if (!openRef.current) {
        void cancelResetToken({ userId, tokenId: minted.id })
        return
      }
      setToken(minted)
      setSettled(false)
      setNow(Date.now())
      liveToken.current = { userId, tokenId: minted.id }
    } catch (err) {
      setError(formatError(err))
    }
  }

  // One token per opening. Minting on open (rather than behind a button) is the point of
  // the flow: the admin already chose "reset this person's password" to get here.
  //
  // Deliberately keyed on the identity being reset, not on `mint`: `mint` closes over the
  // same `userId` this effect depends on, so the narrow deps are complete — and depending
  // on its (per-render) identity would mint a fresh token, cancelling the one on screen,
  // every time this component re-rendered.
  useEffect(() => {
    if (!open || userId == null) return
    void mint()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId])

  // A live token outlives the sheet unless we say otherwise: 15 minutes of redeemable
  // link for a QR that was on screen for ten seconds is not what closing the sheet means.
  useEffect(() => {
    if (open) return
    const outstanding = liveToken.current
    liveToken.current = null
    setToken(null)
    setError(null)
    setCopied(false)
    setSettled(false)
    if (outstanding) void cancelResetToken(outstanding)
  }, [open, cancelResetToken])

  // Drives the countdown only — the expiry itself is the backend's call, which the poll
  // reports as EXPIRED. A ticking clock with nothing to tick for is just wasted renders.
  useEffect(() => {
    if (!open || token == null || tokenStatus !== "PENDING") return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [open, token, tokenStatus])

  const handleCopy = async () => {
    if (!token) return
    try {
      await navigator.clipboard.writeText(token.url)
      setCopied(true)
    } catch {
      // Clipboard access can be denied; the URL is selectable text either way.
    }
  }

  const remaining = token ? token.expiresAtMs - now : 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Reset password</SheetTitle>
        </SheetHeader>
        <SheetBody>
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {isMinting && !token && (
            <div className="flex justify-center p-4">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}

          {token && tokenStatus === "USED" && (
            <Alert>
              <Check className="size-4" />
              <AlertDescription>
                {token.displayName} set a new password. Every device they were signed in on
                has been signed out.
              </AlertDescription>
            </Alert>
          )}

          {token && (tokenStatus === "EXPIRED" || tokenStatus === "CANCELLED") && (
            <div className="space-y-3">
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertDescription>
                  This link is no longer valid
                  {tokenStatus === "EXPIRED" ? " — it expired before it was used." : "."}
                </AlertDescription>
              </Alert>
              <Button variant="outline" className="w-full" onClick={() => void mint()}>
                <RefreshCw className="size-4" />
                Generate a new link
              </Button>
            </div>
          )}

          {token && tokenStatus === "PENDING" && (
            <>
              <p className="text-sm text-muted-foreground">
                Have {token.displayName} scan this on their phone — both devices need to be
                on the same network. They&apos;ll set the password themselves; you never see
                it.
              </p>
              {/* White plate regardless of theme: a dark-on-dark QR doesn't scan. */}
              <div className="flex justify-center rounded-md bg-white p-4">
                <QRCode value={token.url} size={192} />
              </div>
              <p className="text-center text-sm tabular-nums text-muted-foreground">
                Expires in {formatCountdown(remaining)}
              </p>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Or type it in:</p>
                <div className="flex items-start gap-2">
                  <code className="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-xs break-all select-all">
                    {token.url}
                  </code>
                  <Button variant="outline" size="icon" onClick={() => void handleCopy()}>
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    <span className="sr-only">Copy reset link</span>
                  </Button>
                </div>
              </div>
              {token.alternateUrls.length > 0 && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none">
                    Phone can&apos;t reach it? Other addresses
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {token.alternateUrls.map((url) => (
                      <li key={url} className="break-all select-all">
                        {url}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </SheetBody>
        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tokenStatus === "USED" ? "Done" : "Cancel"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
