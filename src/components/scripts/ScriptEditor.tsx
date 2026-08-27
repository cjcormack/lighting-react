import { useState } from "react"
import { Wrench, Play } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useIsDarkMode } from "@/hooks/useIsDarkMode"
import { EditorScriptType } from "@/store/scripts"
// @ts-expect-error - no type declarations for kotlinScript
import ReactKotlinPlayground from "@/kotlinScript/index.mjs"

export interface ScriptEditorScript {
  name: string
  script: string
}

export interface ScriptEditorProps {
  /** The script to display/edit */
  script: ScriptEditorScript

  /** Script ID for key generation (optional) */
  id?: number | string

  /** The script type, determines the Kotlin wrapper for syntax highlighting/autocomplete */
  scriptType?: EditorScriptType

  /** Whether the editor is in read-only mode */
  readOnly?: boolean

  /** Compact mode: show only the code editor, no name/settings cards */
  compact?: boolean

  /** Called when the name changes (editable mode only) */
  onNameChange?: (name: string) => void

  /** Called when the script code changes (editable mode only) */
  onScriptChange?: (script: string) => void

  /** Called when compile is clicked (editable mode only) */
  onCompile?: () => void

  /** Called when run is clicked (editable mode only) */
  onRun?: () => void

  /** Whether compile/run is in progress */
  isCompiling?: boolean
  isRunning?: boolean

  /** Additional actions to render (e.g., Copy to Project button for read-only mode) */
  headerActions?: React.ReactNode

  /** Additional action buttons to render (e.g., Save/Delete for editable mode) */
  footerActions?: React.ReactNode
}

/**
 * What the `kotlin-playground` widget is handed: the script-type marker, then the user's body
 * between the widget's own fold markers.
 *
 * Both kinds of marker are load-bearing, for different consumers:
 *
 * - `//sampleStart` / `//sampleEnd` belong to the **widget**. They fold the editor down to the
 *   body alone, make `onChange` hand back only the body, and offset every position the widget
 *   reports or asks about. It strips them from the text before it talks to the server, so the
 *   backend never sees them.
 * - `//@lighting7-script-type=` belongs to the **backend**. It is the only way the script type can
 *   reach `/api/script-editor`: the widget owns the request shape, and its base URL is a module-level
 *   global that every `playground()` call overwrites, so a per-type endpoint would have two
 *   editors of different types poisoning each other. It sits above `//sampleStart` so the fold
 *   hides it from the user, and first in the document so it wins over any line in the body that
 *   looks like one.
 *
 * There used to be a synthetic base class and an import list here, one per script type. They were
 * not presentation: the widget sends everything outside the fold markers verbatim, so what the
 * backend actually compiled was that stand-in, and its constructor signature had to be kept in
 * step with the real base class by hand. With only the marker line, `ScriptSourceWrapper` compiles
 * the body against the genuine `.kts` template for its type — which is the whole point of serving
 * the language services from the app's own compiler.
 */
function wrapForEditor(scriptType: EditorScriptType, body: string) {
  return `//@lighting7-script-type=${scriptType}\n//sampleStart\n${body}\n//sampleEnd\n`
}

export function ScriptEditor({
  script,
  id,
  scriptType = 'GENERAL',
  readOnly = false,
  compact = false,
  onNameChange,
  onScriptChange,
  onCompile,
  onRun,
  isCompiling,
  isRunning,
  headerActions,
  footerActions,
}: ScriptEditorProps) {
  const isDarkMode = useIsDarkMode()
  const [localName, setLocalName] = useState(script.name)

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value
    setLocalName(newName)
    onNameChange?.(newName)
  }

  const canCompile = script.script !== ""
  const canRun = script.script !== ""

  return (
    <>
      {/* Name section (hidden in compact mode) */}
      {!compact && (
        <Card className="p-4 m-2 flex flex-col">
          {readOnly ? (
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{script.name}</h3>
              {headerActions}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="script-name">Name</Label>
              <Input
                id="script-name"
                required
                value={localName}
                onChange={handleNameChange}
              />
            </div>
          )}
        </Card>
      )}

      {/* Kotlin playground */}
      {compact ? (
        <div className="kotlin-editor overflow-x-auto min-w-0">
          <ReactKotlinPlayground
            mode="kotlin"
            lines="true"
            onChange={readOnly ? undefined : onScriptChange}
            value={wrapForEditor(scriptType, script.script)}
            highlightOnFly="true"
            autocomplete={readOnly ? undefined : "true"}
            matchBrackets={readOnly ? undefined : "true"}
            highlightOnly={readOnly ? "true" : undefined}
            theme={isDarkMode ? "darcula" : "idea"}
            key={`${id ?? "new"}-${scriptType}-${isDarkMode ? "dark" : "light"}`}
          />
        </div>
      ) : (
        <Card className="p-4 m-2 flex flex-col overflow-hidden min-w-0">
          <div className="kotlin-editor overflow-x-auto min-w-0">
            <ReactKotlinPlayground
              mode="kotlin"
              lines="true"
              onChange={readOnly ? undefined : onScriptChange}
              value={wrapForEditor(scriptType, script.script)}
              highlightOnFly="true"
              autocomplete={readOnly ? undefined : "true"}
              matchBrackets={readOnly ? undefined : "true"}
              highlightOnly={readOnly ? "true" : undefined}
              theme={isDarkMode ? "darcula" : "idea"}
              key={`${id ?? "new"}-${scriptType}-${isDarkMode ? "dark" : "light"}`}
            />
          </div>
        </Card>
      )}

      {/* Action buttons */}
      {!readOnly && (onCompile || onRun || footerActions) && (
        <Card className="p-4 m-2 flex flex-col">
          <div className="flex justify-between">
            <div className="flex gap-1">
              {onCompile && (
                <Button
                  variant="outline"
                  disabled={!canCompile || isCompiling}
                  onClick={onCompile}
                >
                  <Wrench className="size-4" />
                  Compile
                </Button>
              )}
              {onRun && (
                <Button
                  variant="outline"
                  disabled={!canRun || isRunning}
                  onClick={onRun}
                >
                  <Play className="size-4" />
                  Run
                </Button>
              )}
            </div>
            {footerActions && <div className="flex gap-1">{footerActions}</div>}
          </div>
        </Card>
      )}
    </>
  )
}
