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

interface ScriptWrapper {
  prefix: string
  suffix: string
}

const SCRIPT_WRAPPERS: Record<EditorScriptType, ScriptWrapper> = {
  GENERAL: {
    prefix: `import uk.me.cormack.lighting7.fixture.*
import uk.me.cormack.lighting7.fixture.dmx.*
import uk.me.cormack.lighting7.fixture.hue.*
import uk.me.cormack.lighting7.fixture.group.*
import uk.me.cormack.lighting7.dmx.*
import uk.me.cormack.lighting7.show.*
import uk.me.cormack.lighting7.scripts.*
import uk.me.cormack.lighting7.fx.*
import uk.me.cormack.lighting7.fx.effects.*
import uk.me.cormack.lighting7.grpc.TrackDetails
import java.awt.Color
import kotlinx.coroutines.*

class TestScript(
    show: Show,
    fixtures: Fixtures.FixturesWithTransaction,
    fxEngine: FxEngine,
    scriptName: String,
    step: Int,
    coroutineScope: CoroutineScope,
    currentTrack: TrackDetails?
): LightingScript(show, fixtures, fxEngine, scriptName, step, coroutineScope, currentTrack) {}

fun TestScript.test() {
//sampleStart
`,
    suffix: `
//sampleEnd
}
`,
  },
  FX_DEFINITION: {
    prefix: `import uk.me.cormack.lighting7.fx.*
import uk.me.cormack.lighting7.fx.effects.*
import java.awt.Color

class TestFxDef(
    show: uk.me.cormack.lighting7.show.Show,
    scriptName: String,
    scriptId: Int?
): uk.me.cormack.lighting7.scripts.FxDefinitionScript(show, scriptName, scriptId) {}

fun TestFxDef.test() {
//sampleStart
`,
    suffix: `
//sampleEnd
}
`,
  },
  FX_APPLICATION: {
    prefix: `import uk.me.cormack.lighting7.fixture.*
import uk.me.cormack.lighting7.fixture.group.*
import uk.me.cormack.lighting7.fixture.trait.*
import uk.me.cormack.lighting7.fx.*
import uk.me.cormack.lighting7.fx.effects.*
import uk.me.cormack.lighting7.fx.group.*
import java.awt.Color

class TestFxApp(
    show: uk.me.cormack.lighting7.show.Show,
    fxEngine: FxEngine,
    scriptName: String,
    step: Int,
    currentTrack: uk.me.cormack.lighting7.grpc.TrackDetails?
): uk.me.cormack.lighting7.scripts.FxApplicationScript(show, fxEngine, scriptName, step, currentTrack) {}

fun TestFxApp.test() {
//sampleStart
`,
    suffix: `
//sampleEnd
}
`,
  },
  FX_CALC: {
    prefix: `import uk.me.cormack.lighting7.fx.*
import uk.me.cormack.lighting7.fx.effects.*
import java.awt.Color
import kotlin.math.*

class TestFxCalc(
    phase: Double,
    context: EffectContext,
    params: TypedParams
): uk.me.cormack.lighting7.scripts.FxCalcScript(phase, context, params) {}

fun TestFxCalc.test() {
//sampleStart
`,
    suffix: `
//sampleEnd
}
`,
  },
  FX_CALC_STATEFUL: {
    prefix: `import uk.me.cormack.lighting7.fx.*
import uk.me.cormack.lighting7.fx.effects.*
import java.awt.Color
import kotlin.math.*

class TestFxStateful(
    tick: MasterClock.ClockTick,
    deltaMs: Long,
    context: EffectContext,
    params: TypedParams,
    state: MutableMap<String, Any>
): uk.me.cormack.lighting7.scripts.FxStatefulCalcScript(tick, deltaMs, context, params, state) {}

fun TestFxStateful.test() {
//sampleStart
`,
    suffix: `
//sampleEnd
}
`,
  },
  FX_CALC_COMPOSITE: {
    prefix: `import uk.me.cormack.lighting7.fx.*
import uk.me.cormack.lighting7.fx.effects.*
import java.awt.Color
import kotlin.math.*

class TestFxComposite(
    phase: Double,
    context: EffectContext,
    params: TypedParams
): uk.me.cormack.lighting7.scripts.FxCompositeCalcScript(phase, context, params) {}

fun TestFxComposite.test() {
//sampleStart
`,
    suffix: `
//sampleEnd
}
`,
  },
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
        <div className="overflow-x-auto min-w-0">
          <ReactKotlinPlayground
            mode="kotlin"
            lines="true"
            onChange={readOnly ? undefined : onScriptChange}
            value={SCRIPT_WRAPPERS[scriptType].prefix + script.script + SCRIPT_WRAPPERS[scriptType].suffix}
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
          <div className="overflow-x-auto min-w-0">
            <ReactKotlinPlayground
              mode="kotlin"
              lines="true"
              onChange={readOnly ? undefined : onScriptChange}
              value={SCRIPT_WRAPPERS[scriptType].prefix + script.script + SCRIPT_WRAPPERS[scriptType].suffix}
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
