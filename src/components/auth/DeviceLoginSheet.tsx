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
import { formatCountdown } from "@/lib/formatCountdown"
import { formatError } from "@/lib/formatError"
import {
  useCancelDeviceLoginMutation,
  useCreateDeviceLoginMutation,
  useDeviceLoginStatusQuery,
  useRevokeOtherSessionsMutation,
  type DeviceLoginResponse,
} from "@/store/auth"

/** Matches the reset sheet's cadence: someone is watching a phone across the room. */
const POLL_INTERVAL_MS = 2000

/**
 * Sign your own phone or tablet in by scanning a QR off the desk.
 *
 * The QR never carries a session token — a photographed QR would be a photographed 30-day
 * cookie. It carries a single-use code the phone exchanges for a real session, and the
 * exchange burns it.
 *
 * **This sheet cancels its code on close, and that is the opposite of what `ResetQrSheet`
 * does** — deliberately, because the risk profiles are opposite. A reset link can only ever
 * set a password, so letting it outlive the sheet costs little and buys a lot of
 * practicality; this one is a way *into* the account, so the two-minute TTL is the backstop
 * and cancel-on-close is the actual control. Resist any temptation to factor the two sheets
 * together.
 *
 * There is no confirmation step (same-LAN plus a physically present crew was judged enough),
 * so the success state names the device that took it and offers to sign it straight back
 * out — detect-and-undo where a confirmation code would have been prevent.
 */
export function DeviceLoginSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [code, setCode] = useState<DeviceLoginResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  /** Latched when the code reaches a terminal status; stops the poll. */
  const [settled, setSettled] = useState(false)
  const [revoked, setRevoked] = useState(false)

  const [createDeviceLogin, { isLoading: isMinting }] = useCreateDeviceLoginMutation()
  const [cancelDeviceLogin] = useCancelDeviceLoginMutation()
  const [revokeOtherSessions, { isLoading: isRevoking }] = useRevokeOtherSessionsMutation()

  // Held in a ref as well as state so the close cleanup can cancel the live code without
  // re-running — and thus cancelling — every time the code changes.
  const liveCode = useRef<string | null>(null)

  // Read after an await to tell "still on screen" from "closed while we were minting".
  // Assigned during render rather than in an effect so it is already correct for a mint that
  // resolves before effects flush.
  const openRef = useRef(open)
  openRef.current = open

  const { data: status } = useDeviceLoginStatusQuery(
    { id: code?.id ?? "" },
    {
      skip: !open || code == null,
      pollingInterval: settled ? 0 : POLL_INTERVAL_MS,
    },
  )
  const codeStatus = status?.status ?? "PENDING"

  useEffect(() => {
    if (codeStatus === "PENDING") return
    liveCode.current = null
    setSettled(true)
  }, [codeStatus])

  const mint = async () => {
    setError(null)
    setCopied(false)
    setRevoked(false)
    try {
      const minted = await createDeviceLogin().unwrap()
      // Closed while the mint was in flight: the cleanup below only cancelled what
      // `liveCode` pointed at *then*, which was nothing. Cancel it here instead — nobody has
      // seen this QR, so leaving it exchangeable would leave a way in that nobody knows about.
      if (!openRef.current) {
        void cancelDeviceLogin({ id: minted.id })
        return
      }
      setCode(minted)
      setSettled(false)
      setNow(Date.now())
      liveCode.current = minted.id
    } catch (err) {
      setError(formatError(err))
    }
  }

  // One code per opening: getting here *is* the intent, so there's no button to press first.
  // Keyed on `open` alone — `mint` closes over nothing that changes, and depending on its
  // per-render identity would mint a fresh code on every re-render, cancelling the one on
  // screen.
  useEffect(() => {
    if (!open) return
    void mint()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // The control that matters: a code must not outlive the screen showing it.
  //
  // Written as a teardown rather than as `if (open) return` in the body, so it fires on
  // **unmount** as well as on close. That distinction is load-bearing: the whole authenticated
  // tree — this sheet included — unmounts when `AuthGate` swaps in the login screen after a 401
  // or a WS 4401, and `open` never flips false on that path. A body-guarded version would leave
  // the code exchangeable for its full TTL after the desk had been signed out.
  useEffect(() => {
    if (!open) return
    return () => {
      const outstanding = liveCode.current
      liveCode.current = null
      if (outstanding) void cancelDeviceLogin({ id: outstanding })
    }
  }, [open, cancelDeviceLogin])

  // Display state only, so reopening doesn't flash the previous code before the new one lands.
  useEffect(() => {
    if (open) return
    setCode(null)
    setError(null)
    setCopied(false)
    setSettled(false)
    setRevoked(false)
  }, [open])

  // Drives the countdown only; expiry itself is the backend's call, reported by the poll.
  useEffect(() => {
    if (!open || code == null || codeStatus !== "PENDING") return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [open, code, codeStatus])

  const handleCopy = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code.url)
      setCopied(true)
    } catch {
      // Clipboard access can be denied; the URL is selectable text either way.
    }
  }

  const handleRevoke = async () => {
    try {
      await revokeOtherSessions().unwrap()
      setRevoked(true)
    } catch (err) {
      setError(formatError(err))
    }
  }

  const remaining = code ? code.expiresAtMs - now : 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Sign in on a phone</SheetTitle>
        </SheetHeader>
        <SheetBody>
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {isMinting && !code && (
            <div className="flex justify-center p-4">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}

          {code && codeStatus === "USED" && (
            <div className="space-y-3">
              <Alert>
                <Check className="size-4" />
                <AlertDescription>
                  Signed in as {code.displayName}
                  {status?.redeemedByUserAgent != null && " on that device"}. It stays signed
                  in for 30 days.
                </AlertDescription>
              </Alert>
              {revoked ? (
                <Alert>
                  <Check className="size-4" />
                  <AlertDescription>
                    Every other device has been signed out. This desk is still signed in.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Wasn&apos;t you? Nobody confirms a scan, so if a device you don&apos;t
                    recognise took this code, sign it out now.
                  </p>
                  <Button
                    variant="destructive"
                    className="w-full"
                    disabled={isRevoking}
                    onClick={() => void handleRevoke()}
                  >
                    {isRevoking && <Loader2 className="size-4 animate-spin" />}
                    That wasn&apos;t me — sign out every other device
                  </Button>
                </>
              )}
            </div>
          )}

          {code && (codeStatus === "EXPIRED" || codeStatus === "CANCELLED") && (
            <div className="space-y-3">
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertDescription>
                  This code is no longer valid
                  {codeStatus === "EXPIRED" ? " — it expired before it was used." : "."}
                </AlertDescription>
              </Alert>
              <Button variant="outline" className="w-full" onClick={() => void mint()}>
                <RefreshCw className="size-4" />
                Show a new code
              </Button>
            </div>
          )}

          {code && codeStatus === "PENDING" && (
            <>
              <p className="text-sm text-muted-foreground">
                Scan this on the phone or tablet you want to sign in as{" "}
                {code.displayName} — both devices need to be on the same network. Tap the
                confirm button that appears on the phone.
              </p>
              {/* White plate regardless of theme: a dark-on-dark QR doesn't scan. */}
              <div className="flex justify-center rounded-md bg-white p-4">
                <QRCode value={code.url} size={192} />
              </div>
              <p className="text-center text-sm tabular-nums text-muted-foreground">
                Expires in {formatCountdown(remaining)}
              </p>
              <p className="text-xs text-muted-foreground">
                Closing this cancels the code — it only works while it&apos;s on screen.
              </p>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Or type it in:</p>
                <div className="flex items-start gap-2">
                  <code className="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-xs break-all select-all">
                    {code.url}
                  </code>
                  <Button variant="outline" size="icon" onClick={() => void handleCopy()}>
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    <span className="sr-only">Copy sign-in link</span>
                  </Button>
                </div>
              </div>
              {code.alternateUrls.length > 0 && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none">
                    Phone can&apos;t reach it? Other addresses
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {code.alternateUrls.map((url) => (
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
            {codeStatus === "USED" ? "Done" : "Cancel"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
