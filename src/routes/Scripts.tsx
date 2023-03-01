import {Box, Container, Divider, Grid, List, ListItem, ListItemButton, ListItemIcon, ListItemText} from "@mui/material";
import React, {Suspense} from "react";
import {selector, selectorFamily, useRecoilValue} from "recoil";
import {lightingApi} from "../api/lightingApi";
import {Script} from "../api/scriptsApi";
import {Drafts, Inbox} from "@mui/icons-material";

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
      <>
        <Grid container spacing={0}>
          <Grid item xs="auto">
            <Box sx={{ width: 200, bgcolor: 'background.paper' }}>
              <nav aria-label="main mailbox folders">
                <List>
                  <ListItem disablePadding>
                    <ListItemButton>
                      <ListItemIcon>
                        <Inbox />
                      </ListItemIcon>
                      <ListItemText primary="Inbox" />
                    </ListItemButton>
                  </ListItem>
                  <ListItem disablePadding>
                    <ListItemButton>
                      <ListItemIcon>
                        <Drafts />
                      </ListItemIcon>
                      <ListItemText primary="Drafts" />
                    </ListItemButton>
                  </ListItem>
                </List>
              </nav>
              <Divider />
              <nav aria-label="secondary mailbox folders">
                <List>
                  <ListItem disablePadding>
                    <ListItemButton>
                      <ListItemText primary="Trash" />
                    </ListItemButton>
                  </ListItem>
                  <ListItem disablePadding>
                    <ListItemButton component="a" href="#simple-list">
                      <ListItemText primary="Spam" />
                    </ListItemButton>
                  </ListItem>
                </List>
              </nav>
            </Box>
          </Grid>
          <Grid item xs>
            b
          </Grid>
        </Grid>
        {/*<Suspense fallback={'Loading...'}>
          <ScriptList/>
        </Suspense>
        <Suspense fallback={'Loading...'}>
          <ScriptDisplay id={28}/>
        </Suspense>*/}
      </>
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
