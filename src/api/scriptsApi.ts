import {
  array,
  bool,
  CheckerReturnType,
  jsonParserEnforced,
  literal, mixed, nullable,
  number,
  object,
  string,
  union
} from "@recoiljs/refine";
import {InternalApiConnection} from "./internalApi";

export const ScriptChecker = object({
  id: number(),
  name: string(),
  script: string(),
})

const ScriptParser = jsonParserEnforced(ScriptChecker)

const ScriptListParser = jsonParserEnforced(array(ScriptChecker))

const CompileResultMessageChecker = object({
  severity: union(
      literal('INFO'),
      literal('WARNING'),
      literal('ERROR'),
  ),
  message: string(),
  sourcePath: nullable(string()),
  location: nullable(string()),
})

const CompileResultChecker = object({
  success: bool(),
  messages: array(CompileResultMessageChecker)
})

const CompileResultParser = jsonParserEnforced(CompileResultChecker)

const RunResultChecker = object({
  status: union(
      literal('success'),
      literal('compileError'),
      literal('exception'),
  ),
  messages: array(CompileResultMessageChecker),
  result: nullable(string()),
})

export const RunResultParser = jsonParserEnforced(RunResultChecker)

export type Script = CheckerReturnType<typeof ScriptChecker>
export type ScriptDetails = {
  name: string,
  script: string,
}

export type CompileResult = CheckerReturnType<typeof CompileResultChecker>

export type RunResult = CheckerReturnType<typeof RunResultChecker>

export interface ScriptsApi {
  getAll(): Promise<readonly Script[]>,
  get(id: number): Promise<Script | undefined>,
  compile(script: string): Promise<CompileResult>,
  run(script: string): Promise<RunResult>,
  save(id: number, script: ScriptDetails): Promise<Script>,
  delete(id: number): Promise<void>,
  create(script: ScriptDetails): Promise<Script>,
}

export function createScriptApi(conn: InternalApiConnection): ScriptsApi {
  return {
    getAll(): Promise<readonly Script[]> {
      return fetch(conn.baseUrl+"rest/script/list").then((res) => {
          return res.text().then((text) => ScriptListParser(text))
      })
    },
    get(id: number): Promise<Script | undefined> {
      return this.getAll().then((allScripts) => {
        return allScripts.filter((script) => script.id === id).pop()
      })
    },
    compile(script: string): Promise<CompileResult> {
      return fetch(conn.baseUrl+"rest/script/compile", {
        method: "POST",
        body: script,
      }).then((res) => {
        return res.text().then((text) => CompileResultParser(text))
      })
    },
    run(script: string): Promise<RunResult> {
      return fetch(conn.baseUrl+"rest/script/run", {
        method: "POST",
        body: script,
      }).then((res) => {
        return res.text().then((text) => RunResultParser(text))
      })
    },
    save(id: number, script: ScriptDetails) {
      return fetch(`${conn.baseUrl}rest/script/${id}`, {
        method: "PUT",
        headers:{'content-type': 'application/json'},
        body: JSON.stringify(script),
      }).then((res) => {
        return res.text().then((text) => ScriptParser(text))
      })
    },
    delete(id: number) {
      return fetch(`${conn.baseUrl}rest/script/${id}`, {
        method: "DELETE",
      }).then(() => {})
    },
    create(script: ScriptDetails): Promise<Script> {
      return fetch(`${conn.baseUrl}rest/script`, {
        method: "POST",
        headers:{'content-type': 'application/json'},
        body: JSON.stringify(script),
      }).then((res) => {
        return res.text().then((text) => ScriptParser(text))
      })
    },
  }
}
