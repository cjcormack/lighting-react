import { useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Loader2, Activity, Wifi, Music, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { useCurrentProjectQuery, useProjectQuery } from "@/store/projects"
import {
  useGetArtNetRatesQuery,
  useGetCueEditHistogramQuery,
  useGetMidiLatencyQuery,
  useResetMidiLatencyMutation,
  type LatencyHistogramSnapshot,
  type PortCcRates,
  type UniversePacketStats,
} from "@/store/perf"
import { Breadcrumbs } from "@/components/Breadcrumbs"

const POLL_INTERVAL_MS = 2000

// ─── Redirect ─────────────────────────────────────────────────────────

export function DiagnosticsRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/diagnostics`, { replace: true })
    }
  }, [currentProject, isLoading, navigate])

  if (isLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }
  return null
}

// ─── Main route ───────────────────────────────────────────────────────

export function ProjectDiagnostics() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const { data: project, isLoading } = useProjectQuery(projectIdNum)

  if (isLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }
  if (!project) {
    return <Card className="m-4 p-4"><p className="text-destructive">Project not found</p></Card>
  }

  return (
    <div className="p-4 space-y-4 max-w-5xl">
      <Breadcrumbs projectName={project.name} currentPage="Diagnostics" />
      <h1 className="text-lg font-semibold">Diagnostics</h1>
      <p className="text-sm text-muted-foreground">
        Live performance counters from <code className="text-xs">/api/rest/perf/*</code>. Polled every {POLL_INTERVAL_MS / 1000}s.
        Backend-global — counters do not reset on project switch.
      </p>
      <ArtNetPanel />
      <CueEditPanel />
      <MidiPanel />
    </div>
  )
}

// ─── ArtNet panel ─────────────────────────────────────────────────────

function ArtNetPanel() {
  const { data, isLoading } = useGetArtNetRatesQuery(undefined, {
    pollingInterval: POLL_INTERVAL_MS,
  })

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Wifi className="size-4" />
        <h2 className="font-semibold">ArtNet packet rates</h2>
        {data && (
          <Badge variant="outline" className="text-xs">
            {data.windowSeconds}s rolling window
          </Badge>
        )}
      </div>
      {isLoading && !data ? (
        <Loader2 className="size-4 animate-spin" />
      ) : !data || data.universes.length === 0 ? (
        <EmptyState
          title="No ArtNet universes"
          body="No ArtNet controllers active. Patch fixtures on a non-mock universe to populate this panel."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subnet</TableHead>
              <TableHead>Universe</TableHead>
              <TableHead className="text-right">Packets / sec</TableHead>
              <TableHead className="text-right">Total packets</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.universes.map((u) => (
              <UniverseRow key={`${u.subnet}-${u.universe}`} universe={u} />
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}

function UniverseRow({ universe }: { universe: UniversePacketStats }) {
  return (
    <TableRow>
      <TableCell className="tabular-nums">{universe.subnet}</TableCell>
      <TableCell className="tabular-nums">{universe.universe}</TableCell>
      <TableCell className="text-right tabular-nums">{universe.packetsPerSec.toFixed(1)}</TableCell>
      <TableCell className="text-right tabular-nums">{universe.totalPackets.toLocaleString()}</TableCell>
    </TableRow>
  )
}

// ─── cueEdit panel ────────────────────────────────────────────────────

function CueEditPanel() {
  const { data, isLoading } = useGetCueEditHistogramQuery(undefined, {
    pollingInterval: POLL_INTERVAL_MS,
  })

  const hasLive = data?.sessionActive && data.live.count > 0
  const fallback = data?.lastSessionEnded && data.lastSessionEnded.count > 0
    ? data.lastSessionEnded
    : null

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="size-4" />
        <h2 className="font-semibold">cueEdit set-property latency</h2>
        {data?.sessionActive ? (
          <Badge variant="default" className="text-xs">session active</Badge>
        ) : (
          <Badge variant="outline" className="text-xs">idle</Badge>
        )}
      </div>
      {isLoading && !data ? (
        <Loader2 className="size-4 animate-spin" />
      ) : !data ? null : hasLive ? (
        <HistogramView title="Live (current session)" snapshot={data.live} />
      ) : fallback ? (
        <HistogramView title="Last completed session" snapshot={fallback} />
      ) : (
        <EmptyState
          title="No cueEdit observations yet"
          body="No cueEdit session has run since startup. Open a cue editor in Live mode and adjust a bound fader (or run MidiFloodHarness) to populate this panel."
        />
      )}
    </Card>
  )
}

// ─── MIDI panel ───────────────────────────────────────────────────────

function MidiPanel() {
  const { data, isLoading } = useGetMidiLatencyQuery(undefined, {
    pollingInterval: POLL_INTERVAL_MS,
  })
  const [resetMidi, { isLoading: resetting }] = useResetMidiLatencyMutation()

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Music className="size-4" />
        <h2 className="font-semibold">MIDI surface latency</h2>
        {data && (
          <Badge variant="outline" className="text-xs">
            {data.windowSeconds}s rolling window
          </Badge>
        )}
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          disabled={resetting || !data}
          onClick={() => resetMidi()}
        >
          <RefreshCw className={cn("size-3.5 mr-1", resetting && "animate-spin")} />
          Reset
        </Button>
      </div>
      {isLoading && !data ? (
        <Loader2 className="size-4 animate-spin" />
      ) : !data ? null : (
        <>
          <MidiStageTable histograms={data.histograms.buckets} />
          <Separator />
          <MidiPortTable ports={data.ports} />
        </>
      )}
    </Card>
  )
}

function MidiStageTable({
  histograms,
}: {
  histograms: Record<string, LatencyHistogramSnapshot>
}) {
  const stages = Object.entries(histograms)
  const hasObservations = stages.some(([, h]) => h.count > 0)
  if (!hasObservations) {
    return (
      <EmptyState
        title="No MIDI surface activity"
        body="Connect a control surface and adjust a fader or press a button to populate per-stage latency."
      />
    )
  }
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-2">Per-stage latency</div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Stage</TableHead>
            <TableHead className="text-right">Count</TableHead>
            <TableHead className="text-right">p50</TableHead>
            <TableHead className="text-right">p95</TableHead>
            <TableHead className="text-right">p99</TableHead>
            <TableHead className="text-right">Max</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stages.map(([wireName, snap]) => (
            <TableRow key={wireName}>
              <TableCell className="font-mono text-xs">{wireName}</TableCell>
              <TableCell className="text-right tabular-nums">{snap.count.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNanos(snap.p50Nanos)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNanos(snap.p95Nanos)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNanos(snap.p99Nanos)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNanos(snap.maxNanos)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function MidiPortTable({ ports }: { ports: PortCcRates[] }) {
  if (ports.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">No MIDI ports connected.</div>
    )
  }
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-2">Per-port CC rates</div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Port</TableHead>
            <TableHead className="text-right">In CC / sec</TableHead>
            <TableHead className="text-right">In total</TableHead>
            <TableHead className="text-right">Out CC / sec</TableHead>
            <TableHead className="text-right">Out total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ports.map((p) => (
            <TableRow key={p.displayKey}>
              <TableCell>
                <div className="text-sm">{p.displayName}</div>
                <div className="text-[10px] font-mono text-muted-foreground">{p.displayKey}</div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{p.inboundCcPerSec.toFixed(1)}</TableCell>
              <TableCell className="text-right tabular-nums">{p.inboundCcTotal.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums">{p.outboundCcPerSec.toFixed(1)}</TableCell>
              <TableCell className="text-right tabular-nums">{p.outboundCcTotal.toLocaleString()}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ─── Histogram rendering ──────────────────────────────────────────────

function HistogramView({
  title,
  snapshot,
}: {
  title: string
  snapshot: LatencyHistogramSnapshot
}) {
  const buckets = snapshot.buckets
  const firstNonZero = buckets.findIndex((b) => b.count > 0)
  const lastNonZero = buckets.reduce(
    (last, b, i) => (b.count > 0 ? i : last),
    -1,
  )
  const trimmed = firstNonZero >= 0
    ? buckets.slice(firstNonZero, lastNonZero + 1)
    : []
  const maxCount = trimmed.reduce((m, b) => Math.max(m, b.count), 1)

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
        <Stat label="count" value={snapshot.count.toLocaleString()} />
        <Stat label="mean" value={formatNanos(snapshot.meanNanos)} />
        <Stat label="p50" value={formatNanos(snapshot.p50Nanos)} />
        <Stat label="p95" value={formatNanos(snapshot.p95Nanos)} />
        <Stat label="p99" value={formatNanos(snapshot.p99Nanos)} />
        <Stat label="max" value={formatNanos(snapshot.maxNanos)} />
      </div>
      {trimmed.length > 0 && (
        <div className="space-y-0.5">
          {trimmed.map((b, i) => {
            const idx = firstNonZero + i
            const lower = idx === 0 ? 0 : buckets[idx - 1].upperBoundNanos
            const widthPct = (b.count / maxCount) * 100
            return (
              <div key={idx} className="flex items-center gap-2 text-[11px] tabular-nums">
                <div className="w-32 text-right text-muted-foreground">
                  {formatNanos(lower)} – {formatNanos(b.upperBoundNanos)}
                </div>
                <div className="flex-1 bg-muted rounded h-3 overflow-hidden">
                  <div
                    className="bg-primary h-full"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <div className="w-16 text-right">{b.count.toLocaleString()}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed p-4 text-sm">
      <div className="font-medium">{title}</div>
      <p className="mt-1 text-muted-foreground">{body}</p>
    </div>
  )
}

function formatNanos(n: number): string {
  if (n < 1_000) return `${n} ns`
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)} µs`
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(2)} ms`
  return `${(n / 1_000_000_000).toFixed(2)} s`
}
