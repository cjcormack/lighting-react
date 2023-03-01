import {Container} from "@mui/material";
import React, {Suspense} from "react";
import {selector, selectorFamily, useRecoilValue} from "recoil";
import {lightingApi} from "../api/lightingApi";
import {Script} from "../api/scriptsApi";

const scriptListState = selector<readonly Script[]>({
  key: 'scriptList',
  get: () => {
    return lightingApi.scripts.getAll()
  },
})

const scriptIdsState = selector<Array<number>>({
  key: 'scriptIds',
  get: ({get}) => {
    const scripts = get(scriptListState)
    return scripts.map((it) => it.id)
  },
})

const scriptsMappedByIdState = selector<Map<number, Script>>({
  key: 'scriptsMappedById',
  get: ({get}) => {
    const scriptList = get(scriptListState)
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

  if (script === undefined) {
    return null
  }

  return (
      <div>
        {script.script}
      </div>
  )
}
