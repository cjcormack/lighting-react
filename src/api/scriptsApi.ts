import {
  array,
  CheckerReturnType,
  jsonParserEnforced,
  literal, nullable,
  object,
  string,
  union
} from "@recoiljs/refine";

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

export type RunResult = CheckerReturnType<typeof RunResultChecker>
