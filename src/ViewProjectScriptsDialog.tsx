import { Dispatch, SetStateAction, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { ArrowLeft, Loader2 } from "lucide-react"
import {
  useProjectScriptsQuery,
  useProjectScriptQuery,
} from "./store/projects"
import { useIsDarkMode } from "@/hooks/useIsDarkMode"
// @ts-expect-error - no type declarations for kotlinScript
import ReactKotlinPlayground from "./kotlinScript/index.mjs"
import CopyScriptDialog from "./CopyScriptDialog"

interface ViewProjectScriptsDialogProps {
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
  projectId: number
  projectName: string
}

export default function ViewProjectScriptsDialog({
  open,
  setOpen,
  projectId,
  projectName,
}: ViewProjectScriptsDialogProps) {
  const [selectedScriptId, setSelectedScriptId] = useState<number | null>(null)

  const handleClose = () => {
    setSelectedScriptId(null)
    setOpen(false)
  }

  const handleBack = () => {
    setSelectedScriptId(null)
  }

  return (
    <Dialog open={open} onOpenChange={open => !open && handleClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {selectedScriptId !== null && (
              <Button variant="ghost" size="icon-sm" onClick={handleBack}>
                <ArrowLeft className="size-4" />
              </Button>
            )}
            <DialogTitle>Scripts from &quot;{projectName}&quot;</DialogTitle>
            <Badge variant="outline">Read-only</Badge>
          </div>
        </DialogHeader>
        <div className="min-h-[400px] border-t pt-4">
          {selectedScriptId === null ? (
            <ScriptsList
              projectId={projectId}
              onSelectScript={setSelectedScriptId}
            />
          ) : (
            <ScriptViewer projectId={projectId} scriptId={selectedScriptId} />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ScriptsList({
  projectId,
  onSelectScript,
}: {
  projectId: number
  onSelectScript: (scriptId: number) => void
}) {
  const { data: scripts, isLoading } = useProjectScriptsQuery(projectId)

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  if (!scripts || scripts.length === 0) {
    return (
      <p className="p-4 text-muted-foreground">No scripts in this project.</p>
    )
  }

  return (
    <ul className="divide-y">
      {scripts.map(script => (
        <li key={script.id}>
          <button
            className="w-full px-4 py-3 text-left hover:bg-accent transition-colors"
            onClick={() => onSelectScript(script.id)}
          >
            <div className="font-medium">{script.name}</div>
            <div className="text-sm text-muted-foreground">
              {script.settingsCount > 0
                ? `${script.settingsCount} setting${script.settingsCount > 1 ? "s" : ""}`
                : "No settings"}
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

function ScriptViewer({
  projectId,
  scriptId,
}: {
  projectId: number
  scriptId: number
}) {
  const isDarkMode = useIsDarkMode()
  const [copyDialogOpen, setCopyDialogOpen] = useState(false)
  const { data: script, isLoading } = useProjectScriptQuery({
    projectId,
    scriptId,
  })

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  if (!script) {
    return <p className="p-4 text-destructive">Script not found.</p>
  }

  const scriptPrefix = `import uk.me.cormack.lighting7.fixture.*
import uk.me.cormack.lighting7.fixture.dmx.*
import uk.me.cormack.lighting7.fixture.hue.*
import java.awt.Color
import uk.me.cormack.lighting7.dmx.*
import uk.me.cormack.lighting7.show.*
import uk.me.cormack.lighting7.scripts.*
import uk.me.cormack.lighting7.scriptSettings.*

class TestScript(
    fixtures: Fixtures.FixturesWithTransaction,
    scriptName:
    String,
    step: Int,
    sceneName: String,
    sceneIsActive: Boolean,
    settings: Map<String, String>
): LightingScript(fixtures, scriptName, step, sceneName, sceneIsActive, settings) {}

fun TestScript.test() {
//sampleStart
`
  const scriptSuffix = `
//sampleEnd
}
`

  return (
    <div className="space-y-4">
      <CopyScriptDialog
        open={copyDialogOpen}
        setOpen={setCopyDialogOpen}
        sourceProjectId={projectId}
        scriptId={scriptId}
        scriptName={script.name}
      />
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{script.name}</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCopyDialogOpen(true)}
        >
          Copy to Project
        </Button>
      </div>
      {script.settings.length > 0 && (
        <Card className="p-4">
          <h4 className="text-sm font-medium mb-2">Settings</h4>
          <div className="flex flex-wrap gap-2">
            {script.settings.map(setting => (
              <Badge key={setting.name} variant="outline">
                {setting.name}: {setting.defaultValue ?? "—"}
              </Badge>
            ))}
          </div>
        </Card>
      )}
      <Card className="overflow-hidden">
        <ReactKotlinPlayground
          mode="kotlin"
          lines="true"
          value={scriptPrefix + script.script + scriptSuffix}
          highlightOnFly="true"
          readOnly="true"
          theme={isDarkMode ? "darcula" : "idea"}
          key={`${projectId}-${scriptId}-${isDarkMode ? "dark" : "light"}`}
        />
      </Card>
    </div>
  )
}
