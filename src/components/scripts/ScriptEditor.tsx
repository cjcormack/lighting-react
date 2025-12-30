import { useState } from "react"
import { Wrench, Play } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useIsDarkMode } from "@/hooks/useIsDarkMode"
import { ScriptSettingsTable, SettingDisplay } from "./ScriptSettingsTable"
import { ScriptSetting } from "@/store/scripts"
// @ts-expect-error - no type declarations for kotlinScript
import ReactKotlinPlayground from "@/kotlinScript/index.mjs"

export interface ScriptEditorScript {
  name: string
  script: string
  settings: readonly SettingDisplay[]
}

export interface ScriptEditorProps {
  /** The script to display/edit */
  script: ScriptEditorScript

  /** Script ID for key generation (optional) */
  id?: number | string

  /** Whether the editor is in read-only mode */
  readOnly?: boolean

  /** Called when the name changes (editable mode only) */
  onNameChange?: (name: string) => void

  /** Called when the script code changes (editable mode only) */
  onScriptChange?: (script: string) => void

  /** Called when a setting is added (editable mode only) */
  onAddSetting?: (setting: ScriptSetting) => void

  /** Called when a setting is removed (editable mode only) */
  onRemoveSetting?: (setting: ScriptSetting) => void

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

export function ScriptEditor({
  script,
  id,
  readOnly = false,
  onNameChange,
  onScriptChange,
  onAddSetting,
  onRemoveSetting,
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
      {/* Name section */}
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

      {/* Settings section */}
      <ScriptSettingsTable<SettingDisplay>
        settings={script.settings}
        onAddSetting={readOnly ? undefined : onAddSetting}
        onRemoveSetting={readOnly ? undefined : (onRemoveSetting as ((setting: SettingDisplay) => void) | undefined)}
        readOnly={readOnly}
      />

      {/* Kotlin playground */}
      <Card className="p-4 m-2 flex flex-col overflow-hidden min-w-0">
        <div className="overflow-x-auto min-w-0">
          <ReactKotlinPlayground
            mode="kotlin"
            lines="true"
            onChange={readOnly ? undefined : onScriptChange}
            value={scriptPrefix + script.script + scriptSuffix}
            highlightOnFly="true"
            autocomplete={readOnly ? undefined : "true"}
            matchBrackets={readOnly ? undefined : "true"}
            readOnly={readOnly ? "true" : undefined}
            theme={isDarkMode ? "darcula" : "idea"}
            key={`${id ?? "new"}-${isDarkMode ? "dark" : "light"}`}
          />
        </div>
      </Card>

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
