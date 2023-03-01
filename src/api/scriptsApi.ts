import {array, CheckerReturnType, jsonParserEnforced, number, object, string} from "@recoiljs/refine";
import {InternalApiConnection} from "./internalApi";

export const ScriptChecker = object({
  id: number(),
  name: string(),
  script: string(),
})

export type Script = CheckerReturnType<typeof ScriptChecker>

const ScriptListParser = jsonParserEnforced(object({
  scripts: array(ScriptChecker),
}))

export interface ScriptsApi {
  getAll(): Promise<readonly Script[]>,
}

export function createScriptApi(conn: InternalApiConnection): ScriptsApi {
  return {
    getAll(): Promise<readonly Script[]> {
      return fetch(conn.baseUrl+"rest/script/list").then((res) => {
          return res.text().then((text) => ScriptListParser(text).scripts)
      })
    }
  }
}
