import { useEffect, useMemo, useState } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Sheet,
  SheetContent,
  SheetBody,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  ChevronRight,
  ChevronDown,
  Loader2,
  Plus,
  Pencil,
  Lock,
  Trash2,
  Wrench,
  Play,
} from "lucide-react"
import {
  useCurrentProjectQuery,
  useProjectQuery,
  useCompileProjectScriptMutation,
  useRunProjectScriptMutation,
} from "../store/projects"
import {
  useEffectLibraryQuery,
  type EffectLibraryEntry,
  type EffectParameterDef,
} from "../store/fixtureFx"
import {
  useFxDefinitionQuery,
  useCreateFxDefinitionMutation,
  useUpdateFxDefinitionMutation,
  useDeleteFxDefinitionMutation,
} from "../store/fxDefinitions"
import { Breadcrumbs } from "@/components/Breadcrumbs"
import { ScriptEditor } from "@/components/scripts/ScriptEditor"
import {
  ScriptCompileDialog,
  ScriptRunDialog,
} from "@/components/scripts/ScriptResultDialogs"
import type { FxCalcEditorType } from "../store/scripts"

// ─── Redirect ─────────────────────────────────────────────────────────

export function FxLibraryRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/fx-library`, { replace: true })
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

export function ProjectFxLibrary() {
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
    return (
      <Card className="m-4 p-4">
        <p className="text-destructive">Project not found</p>
      </Card>
    )
  }

  return (
    <FxLibraryContent
      projectName={project.name}
      isCurrent={project.isCurrent}
    />
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────

const CATEGORY_ORDER = ["dimmer", "colour", "position", "controls", "composite"]
const CATEGORY_LABELS: Record<string, string> = {
  dimmer: "Dimmer",
  colour: "Colour",
  position: "Position",
  controls: "Controls",
  composite: "Composite",
}

const OUTPUT_TYPE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  SLIDER: "secondary",
  COLOUR: "outline",
  POSITION: "default",
}

function effectModeToEditorType(effectMode?: string): FxCalcEditorType {
  switch (effectMode) {
    case "STATEFUL": return "FX_CALC_STATEFUL"
    case "COMPOSITE": return "FX_CALC_COMPOSITE"
    default: return "FX_CALC"
  }
}

function displayName(name: string): string {
  return name.replace(/([A-Z])/g, " $1").trim()
}

// ─── Content ──────────────────────────────────────────────────────────

type SheetMode =
  | { type: "closed" }
  | { type: "view"; effect: EffectLibraryEntry }
  | { type: "edit"; definitionId: number }
  | { type: "new" }

function FxLibraryContent({
  projectName,
  isCurrent,
}: {
  projectName: string
  isCurrent: boolean
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: library, isLoading } = useEffectLibraryQuery()
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set()
  )
  const [sheetMode, setSheetMode] = useState<SheetMode>({ type: "closed" })

  // Open new sheet when navigated with ?action=new (e.g. from command palette)
  useEffect(() => {
    if (searchParams.get("action") === "new" && isCurrent) {
      setSheetMode({ type: "new" })
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, isCurrent, setSearchParams])

  const grouped = useMemo(() => {
    if (!library) return []
    const groups = new Map<string, EffectLibraryEntry[]>()
    for (const entry of library) {
      const cat = entry.category || "other"
      if (!groups.has(cat)) groups.set(cat, [])
      groups.get(cat)!.push(entry)
    }
    return [...groups.entries()].sort(([a], [b]) => {
      const ai = CATEGORY_ORDER.indexOf(a)
      const bi = CATEGORY_ORDER.indexOf(b)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
  }, [library])

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const handleRowClick = (entry: EffectLibraryEntry) => {
    if (entry.source === "USER" && entry.sourceDefinitionId && isCurrent) {
      setSheetMode({ type: "edit", definitionId: entry.sourceDefinitionId })
    } else {
      setSheetMode({ type: "view", effect: entry })
    }
  }

  if (isLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  return (
    <>
      {/* Fix #3: Sticky header using flex layout like Patches */}
      <div className="flex flex-col h-full">
        <div className="p-4 space-y-4">
          <Breadcrumbs
            projectName={projectName}
            isActive={isCurrent}
            currentPage="FX Library"
          />
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">FX Library</h1>
              <p className="text-sm text-muted-foreground">
                Browse built-in effects and create custom FX scripts.
              </p>
            </div>
            {isCurrent && (
              <Button onClick={() => setSheetMode({ type: "new" })} size="sm" className="gap-1.5 shrink-0">
                <Plus className="size-4" />
                <span className="hidden sm:inline">New FX</span>
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[250px]">Name</TableHead>
                <TableHead className="hidden md:table-cell">Properties</TableHead>
                <TableHead className="w-[100px]">Source</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map(([category, effects]) => {
                const isCollapsed = collapsedCategories.has(category)
                return (
                  <CategoryGroup
                    key={category}
                    category={category}
                    effects={effects}
                    isCollapsed={isCollapsed}
                    onToggle={() => toggleCategory(category)}
                    onRowClick={handleRowClick}
                    isCurrent={isCurrent}
                  />
                )
              })}
              {grouped.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No effects available.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Sheet
        open={sheetMode.type !== "closed"}
        onOpenChange={(open) => {
          if (!open) setSheetMode({ type: "closed" })
        }}
      >
        {sheetMode.type === "view" && (
          <SheetContent side="right" className="flex flex-col sm:max-w-lg">
            <EffectDetailSheet effect={sheetMode.effect} />
          </SheetContent>
        )}
        {sheetMode.type === "edit" && (
          <SheetContent side="right" className="flex flex-col sm:max-w-lg">
            <EditFxDefinitionSheet
              definitionId={sheetMode.definitionId}
              onClose={() => setSheetMode({ type: "closed" })}
            />
          </SheetContent>
        )}
        {sheetMode.type === "new" && (
          <SheetContent side="right" className="flex flex-col sm:max-w-lg">
            <NewFxDefinitionSheet
              onClose={() => setSheetMode({ type: "closed" })}
              onCreated={(id) => setSheetMode({ type: "edit", definitionId: id })}
            />
          </SheetContent>
        )}
      </Sheet>
    </>
  )
}

// ─── Category group rows ──────────────────────────────────────────────

function CategoryGroup({
  category,
  effects,
  isCollapsed,
  onToggle,
  onRowClick,
  isCurrent,
}: {
  category: string
  effects: EffectLibraryEntry[]
  isCollapsed: boolean
  onToggle: () => void
  onRowClick: (entry: EffectLibraryEntry) => void
  isCurrent: boolean
}) {
  const label = CATEGORY_LABELS[category] ?? category
  const Chevron = isCollapsed ? ChevronRight : ChevronDown

  return (
    <>
      <TableRow className="bg-muted/50 cursor-pointer hover:bg-muted" onClick={onToggle}>
        <TableCell colSpan={4} className="py-2">
          <div className="flex items-center gap-2 font-medium">
            <Chevron className="size-4" />
            {label}
            <Badge variant="secondary" className="text-xs">{effects.length}</Badge>
          </div>
        </TableCell>
      </TableRow>
      {!isCollapsed &&
        effects.map((effect) => (
          <EffectRow key={effect.name} effect={effect} onClick={() => onRowClick(effect)} isCurrent={isCurrent} />
        ))}
    </>
  )
}

function EffectRow({
  effect,
  onClick,
  isCurrent,
}: {
  effect: EffectLibraryEntry
  onClick: () => void
  isCurrent: boolean
}) {
  const isUser = effect.source === "USER"

  return (
    <TableRow className="cursor-pointer" onClick={onClick}>
      <TableCell className="font-medium">{displayName(effect.name)}</TableCell>
      <TableCell className="hidden md:table-cell">
        <div className="flex flex-wrap gap-1">
          {effect.compatibleProperties.map((prop) => (
            <Badge key={prop} variant="outline" className="text-xs">{prop}</Badge>
          ))}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={isUser ? "default" : "secondary"} className="text-xs">
          {isUser ? "Custom" : "Built-in"}
        </Badge>
      </TableCell>
      <TableCell>
        {isUser && isCurrent ? (
          <Pencil className="size-4 text-muted-foreground" />
        ) : (
          <Lock className="size-3.5 text-muted-foreground" />
        )}
      </TableCell>
    </TableRow>
  )
}

// ─── Effect detail (built-in or read-only user) ───────────────────────

function EffectDetailSheet({ effect }: { effect: EffectLibraryEntry }) {
  const name = displayName(effect.name)
  const isUser = effect.source === "USER"
  const editorType = effectModeToEditorType(effect.effectMode)

  return (
    <>
      <SheetHeader className="space-y-2">
        <SheetTitle className="flex items-center gap-2 flex-wrap">
          {name}
          <Badge variant={isUser ? "default" : "secondary"}>
            {isUser ? "Custom" : "Built-in"}
          </Badge>
          <Badge variant={OUTPUT_TYPE_VARIANTS[effect.outputType] ?? "outline"}>
            {effect.outputType.toLowerCase()}
          </Badge>
          <Badge variant="outline" className="capitalize">{effect.category}</Badge>
          {effect.effectMode && effect.effectMode !== "STANDARD" && (
            <Badge variant="outline" className="text-xs">{effect.effectMode.toLowerCase()}</Badge>
          )}
        </SheetTitle>
        {effect.compatibleProperties.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Properties:</span>
            {effect.compatibleProperties.map((prop) => (
              <Badge key={prop} variant="outline" className="text-xs">{prop}</Badge>
            ))}
          </div>
        )}
      </SheetHeader>

      <SheetBody>
        {effect.parameters.length > 0 && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Parameters</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead className="hidden sm:table-cell">Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {effect.parameters.map((param: EffectParameterDef) => (
                  <TableRow key={param.name}>
                    <TableCell className="font-mono text-sm">{param.name}</TableCell>
                    <TableCell>{param.type}</TableCell>
                    <TableCell className="font-mono text-sm">{param.defaultValue}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{param.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {effect.script && (
          <ScriptEditor
            script={{ name, script: effect.script, settings: [] }}
            id={`view-${effect.name}`}
            scriptType={editorType}
            readOnly
            compact
          />
        )}
      </SheetBody>
    </>
  )
}

// ─── Edit FX definition ───────────────────────────────────────────────

function EditFxDefinitionSheet({
  definitionId,
  onClose,
}: {
  definitionId: number
  onClose: () => void
}) {
  const { data: currentProject } = useCurrentProjectQuery()
  const { data: definition, isLoading, isFetching } = useFxDefinitionQuery(definitionId)

  const [
    runCompileMutation,
    { data: compileResult, isUninitialized: hasNotCompiled, isLoading: isCompiling, reset: resetCompile },
  ] = useCompileProjectScriptMutation()
  const [
    runRunMutation,
    { data: runResult, isUninitialized: hasNotRun, isLoading: isTesting, reset: resetRun },
  ] = useRunProjectScriptMutation()
  const [runUpdateMutation, { isLoading: isSaving }] = useUpdateFxDefinitionMutation()
  const [runDeleteMutation, { isLoading: isDeleting }] = useDeleteFxDefinitionMutation()

  const [edits, setEdits] = useState<{
    name?: string
    script?: string
  }>({})

  useEffect(() => {
    setEdits({})
  }, [definitionId])

  if (isLoading || isFetching) {
    return (
      <>
        <SheetHeader><SheetTitle>Edit FX</SheetTitle></SheetHeader>
        <div className="flex justify-center p-8"><Loader2 className="size-6 animate-spin" /></div>
      </>
    )
  }

  if (!definition) {
    return (
      <>
        <SheetHeader><SheetTitle>Edit FX</SheetTitle></SheetHeader>
        <p className="p-4 text-destructive">Definition not found.</p>
      </>
    )
  }

  const editorType = effectModeToEditorType(definition.effectMode)
  const currentName = edits.name ?? definition.name
  const currentScript = edits.script ?? definition.script

  const hasChanged = edits.name !== undefined || edits.script !== undefined
  const canSave = hasChanged && currentName !== "" && currentScript !== ""

  const handleCompile = () => {
    if (!currentProject) return
    runCompileMutation({
      projectId: currentProject.id,
      script: currentScript,
      scriptType: editorType,
    })
  }

  const handleTest = () => {
    if (!currentProject) return
    runRunMutation({
      projectId: currentProject.id,
      script: currentScript,
      scriptType: editorType,
    })
  }

  const handleSave = async () => {
    await runUpdateMutation({
      id: definitionId,
      name: currentName,
      script: currentScript,
    })
    setEdits({})
  }

  const handleDelete = async () => {
    if (confirm(`Delete "${definition.name}"?`)) {
      await runDeleteMutation(definitionId)
      onClose()
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          Edit FX
          <Badge variant="default">Custom</Badge>
          {definition.effectMode !== "STANDARD" && (
            <Badge variant="outline" className="text-xs">{definition.effectMode}</Badge>
          )}
        </SheetTitle>
      </SheetHeader>

      <ScriptCompileDialog
        compileResult={compileResult}
        hasNotCompiled={hasNotCompiled}
        isCompiling={isCompiling}
        resetCompile={resetCompile}
      />
      <ScriptRunDialog
        runResult={runResult}
        hasNotRun={hasNotRun}
        isRunning={isTesting}
        resetRun={resetRun}
      />

      <SheetBody>
        <div className="space-y-1.5">
          <Label htmlFor="edit-fx-name">Name</Label>
          <Input
            id="edit-fx-name"
            value={currentName}
            onChange={(e) => setEdits({ ...edits, name: e.target.value !== definition.name ? e.target.value : undefined })}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Script</Label>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={currentScript === "" || isCompiling || !currentProject}
                onClick={handleCompile}
              >
                <Wrench className="size-3.5" />
                Compile
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentScript === "" || isTesting || !currentProject}
                onClick={handleTest}
              >
                <Play className="size-3.5" />
                Test
              </Button>
            </div>
          </div>
          <ScriptEditor
            script={{ name: currentName, script: currentScript, settings: [] }}
            id={definitionId}
            scriptType={editorType}
            compact
            onScriptChange={(code) => {
              const normalized = code.trim()
              const original = definition.script.trim()
              setEdits({ ...edits, script: normalized !== original ? code : undefined })
            }}
          />
        </div>
      </SheetBody>

      <SheetFooter className="flex-row justify-between">
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          <Trash2 className="size-3.5 mr-1.5" />
          {isDeleting ? "Deleting..." : "Delete"}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button disabled={!canSave || isSaving} onClick={handleSave}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </SheetFooter>
    </>
  )
}

// ─── New FX definition ────────────────────────────────────────────────

const PARAM_TYPES = ["ubyte", "int", "double", "float", "boolean", "colour", "colourList", "easingCurve", "string"]

const NEW_FX_TEMPLATE = `val min = params.ubyte("min")
val max = params.ubyte("max")
val sine = (sin(phase * 2 * PI) + 1.0) / 2.0
val value = (min.toInt() + (max.toInt() - min.toInt()) * sine)
    .toInt().coerceIn(0, 255).toUByte()
FxOutput.Slider(value)
`

function NewFxDefinitionSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: number) => void
}) {
  const { data: currentProject } = useCurrentProjectQuery()
  const [runCreateMutation, { isLoading: isCreating }] = useCreateFxDefinitionMutation()
  const [
    runCompileMutation,
    { data: compileResult, isUninitialized: hasNotCompiled, isLoading: isCompiling, reset: resetCompile },
  ] = useCompileProjectScriptMutation()
  const [
    runRunMutation,
    { data: runResult, isUninitialized: hasNotRun, isLoading: isRunning, reset: resetRun },
  ] = useRunProjectScriptMutation()

  const [name, setName] = useState("")
  const [category, setCategory] = useState("dimmer")
  const [outputType, setOutputType] = useState("SLIDER")
  const [effectMode, setEffectMode] = useState("STANDARD")
  const [scriptCode, setScriptCode] = useState(NEW_FX_TEMPLATE)
  const [parameters, setParameters] = useState<EffectParameterDef[]>([
    { name: "min", type: "ubyte", defaultValue: "0", description: "Minimum value" },
    { name: "max", type: "ubyte", defaultValue: "255", description: "Maximum value" },
  ])

  const editorType = effectModeToEditorType(effectMode)

  const compatibleProperties = (() => {
    switch (category) {
      case "dimmer": return ["dimmer"]
      case "colour": return ["rgbColour"]
      case "position": return ["pan", "tilt"]
      default: return ["dimmer"]
    }
  })()

  const handleCreate = async () => {
    try {
      const result = await runCreateMutation({
        effectId: name.replace(/\s+/g, ""),
        name,
        category,
        outputType,
        effectMode,
        parameters,
        compatibleProperties,
        script: scriptCode,
      }).unwrap()
      onCreated(result.id)
    } catch {
      // Error handling could be improved
    }
  }

  const addParameter = () => {
    setParameters([...parameters, { name: "", type: "ubyte", defaultValue: "0", description: "" }])
  }

  const removeParameter = (index: number) => {
    setParameters(parameters.filter((_, i) => i !== index))
  }

  const updateParameter = (index: number, field: keyof EffectParameterDef, value: string) => {
    setParameters(parameters.map((p, i) => i === index ? { ...p, [field]: value } : p))
  }

  const canCreate = name !== "" && scriptCode !== ""

  return (
    <>
      <ScriptCompileDialog
        compileResult={compileResult}
        hasNotCompiled={hasNotCompiled}
        isCompiling={isCompiling}
        resetCompile={resetCompile}
      />
      <ScriptRunDialog
        runResult={runResult}
        hasNotRun={hasNotRun}
        isRunning={isRunning}
        resetRun={resetRun}
      />

      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          New FX
          <Badge variant="default">Custom</Badge>
        </SheetTitle>
      </SheetHeader>

      <SheetBody>
        {/* Metadata */}
        <div className="space-y-1.5">
          <Label htmlFor="new-fx-name">Name</Label>
          <Input
            id="new-fx-name"
            placeholder="My Custom Effect"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="dimmer">Dimmer</SelectItem>
              <SelectItem value="colour">Colour</SelectItem>
              <SelectItem value="position">Position</SelectItem>
              <SelectItem value="composite">Composite</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Output Type</Label>
          <Select value={outputType} onValueChange={setOutputType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="SLIDER">Slider</SelectItem>
              <SelectItem value="COLOUR">Colour</SelectItem>
              <SelectItem value="POSITION">Position</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Mode</Label>
          <Select value={effectMode} onValueChange={setEffectMode}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="STANDARD">Standard</SelectItem>
              <SelectItem value="STATEFUL">Stateful</SelectItem>
              <SelectItem value="COMPOSITE">Composite</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Parameters */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Parameters</Label>
            <Button variant="outline" size="sm" onClick={addParameter}>
              <Plus className="size-3.5" />
              Add
            </Button>
          </div>
          {parameters.length === 0 && (
            <p className="text-sm text-muted-foreground">No parameters defined.</p>
          )}
          {parameters.map((param, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_1fr_1fr_auto] gap-2 items-end">
              <div>
                {i === 0 && <Label className="text-xs text-muted-foreground">Name</Label>}
                <Input
                  value={param.name}
                  onChange={(e) => updateParameter(i, "name", e.target.value)}
                  placeholder="name"
                  className="h-8 text-sm"
                />
              </div>
              <div>
                {i === 0 && <Label className="text-xs text-muted-foreground">Type</Label>}
                <Select value={param.type} onValueChange={(v) => updateParameter(i, "type", v)}>
                  <SelectTrigger className="h-8 text-sm w-[100px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PARAM_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                {i === 0 && <Label className="text-xs text-muted-foreground">Default</Label>}
                <Input
                  value={param.defaultValue}
                  onChange={(e) => updateParameter(i, "defaultValue", e.target.value)}
                  placeholder="0"
                  className="h-8 text-sm"
                />
              </div>
              <div>
                {i === 0 && <Label className="text-xs text-muted-foreground">Description</Label>}
                <Input
                  value={param.description}
                  onChange={(e) => updateParameter(i, "description", e.target.value)}
                  placeholder="optional"
                  className="h-8 text-sm"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => removeParameter(i)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>

        {/* Script */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Script</Label>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={scriptCode === "" || isCompiling || !currentProject}
                onClick={() => runCompileMutation({ projectId: currentProject!.id, script: scriptCode, scriptType: editorType })}
              >
                <Wrench className="size-3.5" />
                Compile
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={scriptCode === "" || isRunning || !currentProject}
                onClick={() => runRunMutation({ projectId: currentProject!.id, script: scriptCode, scriptType: editorType })}
              >
                <Play className="size-3.5" />
                Test
              </Button>
            </div>
          </div>
          <ScriptEditor
            script={{ name, script: scriptCode, settings: [] }}
            id="new-fx"
            scriptType={editorType}
            compact
            onScriptChange={setScriptCode}
          />
        </div>
      </SheetBody>

      <SheetFooter className="flex-row justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={!canCreate || isCreating} onClick={handleCreate}>
          {isCreating ? "Creating..." : "Create"}
        </Button>
      </SheetFooter>
    </>
  )
}
