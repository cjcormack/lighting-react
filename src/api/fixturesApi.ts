import {
  array,
  CheckerReturnType,
  jsonParserEnforced,
  number, object,
  string
} from "@recoiljs/refine";
import {InternalApiConnection} from "./internalApi";

export const FixtureChecker = object({
  key: string(),
  name: string(),
  typeKey: string(),
  universe: number(),
  channels: array(object({
    channelNo: number(),
    description: string(),
  })),
})

const FixtureListParser = jsonParserEnforced(array(FixtureChecker))

export type Fixture = CheckerReturnType<typeof FixtureChecker>

export interface FixturesApi {
  getAll(): Promise<readonly Fixture[]>
  get(key: string): Promise<Fixture | undefined>
}

export function createFixtureApi(conn: InternalApiConnection): FixturesApi {
  return {
    getAll(): Promise<readonly Fixture[]> {
      return fetch(conn.baseUrl+"rest/fixture/list").then((res) => {
          return res.text().then((text) => FixtureListParser(text))
      })
    },
    get(key: string): Promise<Fixture | undefined> {
      return this.getAll().then((allFixtures) => {
        return allFixtures.filter((fixture) => fixture.key === key).pop()
      })
    },
  }
}
