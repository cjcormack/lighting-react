import {Container} from "@mui/material";
import React, {Suspense} from "react";
import {selector, selectorFamily, useRecoilValue} from "recoil";

export default function Scripts() {
  return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Suspense fallback={'Loading...'}>
          <ScriptList/>
        </Suspense>
        <Suspense fallback={'Loading...'}>
          <ScriptDisplay id={28}/>
        </Suspense>
      </Container>
  )
}

type Scripts = {
  scripts: Array<Script>,
}

type Script = {
  id: number
  name: string,
  script: string,
}

const scriptListState = selector<Scripts>({
  key: 'scriptList',
  get: async () => {
    return await fetch('/lighting/rest/script/list').then((res) => res.json())
  },
})

const scriptIdsState = selector<Array<number>>({
  key: 'scriptIds',
  get: ({get}) => {
    const scripts = get(scriptListState)
    return scripts.scripts.map((it) => it.id)
  },
})

const scriptsMappedByIdState = selector<Map<number, Script>>({
  key: 'scriptsMappedById',
  get: ({get}) => {
    const scriptList = get(scriptListState).scripts
    return new Map(scriptList.map((script => [script.id, script])))
  }
})

const scriptState = selectorFamily<Script, number>({
  key: 'script',
  get: (scriptId: number) => ({get}) => {
    const scriptsMappedById = get(scriptsMappedByIdState)
    const script = scriptsMappedById.get(scriptId)
    if (script === undefined) {
      throw new Error("Script not found")
    }
    return script
  },
})

const ScriptList = () => {
  const scriptIds = useRecoilValue(scriptIdsState)

  return (
      <ul>
        {scriptIds.map((scriptId) => {
          return (
              <Suspense key={scriptId} fallback={'Loading...'}>
                <ScriptListEntry id={scriptId}/>
              </Suspense>
          )
        })}
      </ul>
  )
}

const ScriptListEntry = ({id}: {id: number}) => {
  const script = useRecoilValue(scriptState(id))

  return (
      <li>{script.name}</li>
  )
}

const ScriptDisplay = ({id}: {id: number}) => {
  const script = useRecoilValue(scriptState(id))
  console.log(script)

  if (script === undefined) {
    return null
  }

  return (
      <div>
        {script.script}
      </div>
  )
}
