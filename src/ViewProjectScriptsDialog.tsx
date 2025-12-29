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
import { ArrowLeft, Loader2 } from "lucide-react"
import {
  useProjectScriptsQuery,
  useProjectScriptQuery,
} from "./store/projects"
import { ScriptEditor } from "@/components/scripts/ScriptEditor"
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
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
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
        <div className="min-h-[300px] border-t pt-4 min-w-0 overflow-x-auto">
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

  return (
    <div className="-m-2 min-w-0">
      <CopyScriptDialog
        open={copyDialogOpen}
        setOpen={setCopyDialogOpen}
        sourceProjectId={projectId}
        scriptId={scriptId}
        scriptName={script.name}
      />
      <ScriptEditor
        script={script}
        id={`${projectId}-${scriptId}`}
        readOnly
        headerActions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCopyDialogOpen(true)}
          >
            Copy to Project
          </Button>
        }
      />
    </div>
  )
}
