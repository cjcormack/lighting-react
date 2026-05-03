import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2 } from "lucide-react"
import { useInstallQuery, useUpdateInstallMutation } from "@/store/installs"
import { formatError } from "@/lib/formatError"
import { DiagnosticsContent } from "./Diagnostics"
import { CloudSyncHubBody } from "./CloudSync"

const TABS = ["general", "sync", "diagnostics"] as const
type Tab = (typeof TABS)[number]

function isTab(value: string | undefined): value is Tab {
  return TABS.includes(value as Tab)
}

export function InstallSettings() {
  const { tab } = useParams()
  const navigate = useNavigate()
  const activeTab: Tab = isTab(tab) ? tab : "general"

  const handleTabChange = (value: string) => {
    const next = isTab(value) ? value : "general"
    navigate(next === "general" ? "/install" : `/install/${next}`, { replace: true })
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-4 space-y-3 border-b">
        <div>
          <h1 className="text-lg font-semibold">Install Settings</h1>
          <p className="text-sm text-muted-foreground">
            Settings for this machine running lighting7. Shared across all projects.
          </p>
        </div>
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="sync">Sync</TabsTrigger>
            <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 p-4">
        {activeTab === "general" && <GeneralTab />}
        {activeTab === "sync" && <CloudSyncHubBody />}
        {activeTab === "diagnostics" && <DiagnosticsContent />}
      </div>
    </div>
  )
}

function GeneralTab() {
  const { data: install, isLoading } = useInstallQuery()
  const [updateInstall, { isLoading: isUpdating }] = useUpdateInstallMutation()
  const [friendlyName, setFriendlyName] = useState("")

  // Seed once per install identity. Depending on the whole `install` object
  // would clobber in-progress edits whenever the cache refreshes.
  useEffect(() => {
    if (install) {
      setFriendlyName(install.friendlyName)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [install?.uuid])

  if (isLoading || !install) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  const trimmed = friendlyName.trim()
  const dirty = trimmed !== install.friendlyName
  const isValid = trimmed.length > 0
  const createdAt = new Date(install.createdAtMs).toLocaleString()

  const handleSave = async () => {
    if (!isValid) return
    try {
      await updateInstall({ friendlyName: trimmed }).unwrap()
      toast.success("Install settings saved")
    } catch (err) {
      toast.error(`Failed to save: ${formatError(err)}`)
    }
  }

  return (
    <Card className="p-4 max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">
        This identifies the machine running lighting7. The friendly name appears in
        cloud-sync attribution and in exported project metadata.
      </p>
      <div className="space-y-2">
        <Label htmlFor="install-friendly-name">Friendly name *</Label>
        <Input
          id="install-friendly-name"
          value={friendlyName}
          onChange={(e) => setFriendlyName(e.target.value)}
          maxLength={100}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-muted-foreground">Install UUID</Label>
        <div className="font-mono text-xs break-all">{install.uuid}</div>
      </div>
      <div className="space-y-1">
        <Label className="text-muted-foreground">Created</Label>
        <div className="text-sm">{createdAt}</div>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={!dirty || !isValid || isUpdating}>
          {isUpdating ? "Saving…" : "Save"}
        </Button>
      </div>
    </Card>
  )
}
