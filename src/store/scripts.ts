// Script types - endpoints are now in projects.ts

export type Script = ScriptDetails & {
  id: number
}

// Base script fields (used for create/update requests)
export type ScriptInput = {
  name: string
  script: string
  settings: ScriptSetting[]
}

// Full script details including server-computed fields
export type ScriptDetails = ScriptInput & {
  // Usage tracking fields (server-provided)
  sceneNames: string[]
  chaseNames: string[]
  usedByProperties: string[]
  canDelete: boolean
  cannotDeleteReason: string | null
}

export type ScriptSetting = {
  type: 'scriptSettingInt'
  name: string
  minValue?: number
  maxValue?: number
  defaultValue?: number
}

export type CompileResultMessage = {
  severity: 'INFO'|'WARNING'|'ERROR'
  message: string
  sourcePath?: string
  location?: string
}

export type CompileRequest = {
  script: string
  settings?: ScriptSetting[]
}

export type CompileResult = {
  success: boolean
  messages: CompileResultMessage[]
}

export type RunRequest = CompileRequest

export type RunResult = {
  status: 'success'|'compileError'|'exception'
  messages: CompileResultMessage[]
  result?: string
}
