import { useEffect, useMemo, useState } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Loader2, Sliders, Zap, ZapOff, Power } from "lucide-react"
import { useProjectQuery, useCurrentProjectQuery } from "@/store/projects"
import {
  useSurfaceDevices,
  useActiveBanks,
  useScalerState,
  useControlSurfaceTypeListQuery,
  useSurfaceBindingsQuery,
} from "@/store/surfaces"
import type { ControlSurfaceType, SurfaceDeviceInfo } from "@/store/surfaces"
import { Breadcrumbs } from "@/components/Breadcrumbs"
import { BankSwitcher } from "@/components/surfaces/BankSwitcher"
import { BindingMatrix } from "@/components/surfaces/BindingMatrix"
import { lightingApi } from "@/api/lightingApi"
import { cn } from "@/lib/utils"

// ─── Redirect ─────────────────────────────────────────────────────────

export function SurfacesRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/surfaces`, { replace: true })
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

export function ProjectSurfaces() {
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
    <SurfacesContent projectId={projectIdNum} projectName={project.name} />
  )
}

// ─── Content ──────────────────────────────────────────────────────────

function SurfacesContent({ projectId, projectName }: { projectId: number; projectName: string }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const devices = useSurfaceDevices()
  const banks = useActiveBanks()
  const { data: types } = useControlSurfaceTypeListQuery()
  const { data: bindings } = useSurfaceBindingsQuery(projectId)

  // If a ?binding=<id> query param is present, auto-select that binding's device and bank.
  const highlightBindingId = useMemo(() => {
    const v = searchParams.get("binding")
    return v ? Number(v) : null
  }, [searchParams])

  const [selectedDisplayKey, setSelectedDisplayKey] = useState<string | null>(null)

  // Pick first matched device if nothing selected yet.
  useEffect(() => {
    if (selectedDisplayKey) return
    const first = devices.find((d) => d.isMatched)
    if (first) setSelectedDisplayKey(first.displayKey)
  }, [devices, selectedDisplayKey])

  // If a highlight binding exists, select that device and ensure the bank matches.
  useEffect(() => {
    if (!highlightBindingId || !bindings) return
    const binding = bindings.find((b) => b.id === highlightBindingId)
    if (!binding) return
    const device = devices.find((d) => d.typeKey === binding.deviceTypeKey)
    if (device) setSelectedDisplayKey(device.displayKey)
    if (binding.bank != null && binding.deviceTypeKey) {
      lightingApi.surfaces.setBank(binding.deviceTypeKey, binding.bank)
    }
    // Clear the param after we've consumed it so back-nav doesn't re-trigger.
    const params = new URLSearchParams(searchParams)
    params.delete("binding")
    setSearchParams(params, { replace: true })
  }, [highlightBindingId, bindings, devices, searchParams, setSearchParams])

  const selectedDevice = devices.find((d) => d.displayKey === selectedDisplayKey) ?? null
  const selectedProfile = selectedDevice?.typeKey
    ? (types ?? []).find((t) => t.typeKey === selectedDevice.typeKey) ?? null
    : null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 space-y-3">
        <Breadcrumbs projectName={projectName} currentPage="Surfaces" />
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold">Control surfaces</h1>
            <p className="text-sm text-muted-foreground">
              {devices.length === 0
                ? "No MIDI devices connected."
                : `${devices.length} device${devices.length !== 1 ? "s" : ""} connected.`}
            </p>
          </div>
          <ScalerToolbar />
        </div>
      </div>

      <Separator />

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">
        {/* Left column: device list */}
        <aside className="w-full md:w-72 md:border-r overflow-y-auto p-3 space-y-1 shrink-0">
          {devices.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2">
              Plug in a MIDI controller — it will appear here.
            </p>
          ) : (
            devices.map((device) => (
              <DeviceRow
                key={device.displayKey}
                device={device}
                isSelected={device.displayKey === selectedDisplayKey}
                activeBank={
                  device.typeKey ? (banks[device.typeKey] ?? null) : null
                }
                onSelect={() => setSelectedDisplayKey(device.displayKey)}
              />
            ))
          )}
        </aside>

        {/* Right column: selected device detail */}
        <section className="flex-1 overflow-y-auto p-4">
          {!selectedDevice ? (
            <EmptyState />
          ) : !selectedProfile ? (
            <UnmatchedDeviceState device={selectedDevice} />
          ) : (
            <DeviceDetail
              projectId={projectId}
              device={selectedDevice}
              profile={selectedProfile}
              activeBank={
                selectedDevice.typeKey ? (banks[selectedDevice.typeKey] ?? null) : null
              }
              highlightBindingId={highlightBindingId}
            />
          )}
        </section>
      </div>
    </div>
  )
}

function ScalerToolbar() {
  const scaler = useScalerState()
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={scaler.blackoutEnabled ? "destructive" : "outline"}
        onClick={() => lightingApi.surfaces.setBlackout(!scaler.blackoutEnabled)}
        className="gap-1.5"
      >
        <Power className="size-3.5" />
        {scaler.blackoutEnabled ? "Blackout ON" : "Blackout"}
      </Button>
      <Button
        size="sm"
        variant={scaler.grandMasterEnabled ? "outline" : "default"}
        onClick={() => lightingApi.surfaces.setGrandMaster(!scaler.grandMasterEnabled)}
        className="gap-1.5"
      >
        {scaler.grandMasterEnabled ? (
          <Zap className="size-3.5" />
        ) : (
          <ZapOff className="size-3.5" />
        )}
        GM {scaler.grandMasterEnabled ? "open" : "kill"}
      </Button>
    </div>
  )
}

function DeviceRow({
  device,
  isSelected,
  activeBank,
  onSelect,
}: {
  device: SurfaceDeviceInfo
  isSelected: boolean
  activeBank: string | null
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left p-2 rounded-md border transition-colors",
        isSelected ? "bg-accent border-accent-foreground/20" : "hover:bg-accent/50 border-transparent",
      )}
    >
      <div className="flex items-center gap-2">
        <Sliders className="size-3.5 shrink-0" />
        <span className="font-medium text-sm truncate">{device.displayName}</span>
      </div>
      <div className="mt-1 flex items-center gap-1 flex-wrap">
        {device.isMatched ? (
          <Badge variant="secondary" className="text-[10px]">
            {device.typeKey}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">unmatched</Badge>
        )}
        {activeBank && (
          <Badge variant="outline" className="text-[10px]">bank {activeBank}</Badge>
        )}
        {!device.hasInputPort && (
          <Badge variant="outline" className="text-[10px]">no input</Badge>
        )}
        {!device.hasOutputPort && (
          <Badge variant="outline" className="text-[10px]">no output</Badge>
        )}
      </div>
    </button>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
      <Sliders className="size-8 mb-2 opacity-40" />
      <p>Select a device to view and edit its bindings.</p>
    </div>
  )
}

function UnmatchedDeviceState({ device }: { device: SurfaceDeviceInfo }) {
  return (
    <Card className="p-6 space-y-2">
      <h2 className="font-semibold">{device.displayName}</h2>
      <p className="text-sm text-muted-foreground">
        This device didn't match any registered <code>@ControlSurfaceType</code> profile.
        Add a Kotlin profile under <code>src/main/kotlin/uk/me/cormack/lighting7/midi/devices/</code>
        to bind controls on this device.
      </p>
      <div className="text-xs font-mono text-muted-foreground">
        displayKey: {device.displayKey}
      </div>
    </Card>
  )
}

function DeviceDetail({
  projectId,
  device,
  profile,
  activeBank,
  highlightBindingId,
}: {
  projectId: number
  device: SurfaceDeviceInfo
  profile: ControlSurfaceType
  activeBank: string | null
  highlightBindingId: number | null
}) {
  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h2 className="font-semibold text-base">{device.displayName}</h2>
        <p className="text-xs text-muted-foreground">
          {profile.vendor} · {profile.product} · <span className="font-mono">{profile.typeKey}</span>
        </p>
      </div>
      <BankSwitcher
        deviceTypeKey={profile.typeKey}
        banks={profile.banks}
        activeBank={activeBank}
      />
      <Separator />
      <BindingMatrix
        projectId={projectId}
        device={device}
        profile={profile}
        activeBank={activeBank}
        highlightBindingId={highlightBindingId}
      />
    </div>
  )
}
