import {atom, selector, selectorFamily, useRecoilRefresher_UNSTABLE, useRecoilValue} from "recoil";
import {lightingApi} from "../api/lightingApi";
import {Scene, SceneChecker} from "../api/scenesApi";
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardActions,
  CardContent,
  Chip,
  Container,
  Grid,
  Paper, Stack, Theme,
  Typography
} from "@mui/material";
import React, {Suspense, useState} from "react";
import {scriptState} from "./Scripts";
import {OverridableStringUnion} from "@mui/types";
import {ChipPropsColorOverrides} from "@mui/material/Chip/Chip";
import AddCircleIcon from '@mui/icons-material/AddCircle';
import AddSceneDialog from "../AddSceneDialog";
import {useNavigate} from "react-router-dom";
import {syncEffect} from "recoil-sync";
import {LightingApiScenesListItemKey, LightingApiStoreKey} from "../connection";
import {array} from "@recoiljs/refine";
import {SxProps} from "@mui/system";

export const sceneListState = atom<readonly Scene[]>({
  key: 'sceneList',
  default: [],
  effects: [
    syncEffect({
      itemKey: LightingApiScenesListItemKey,
      storeKey: LightingApiStoreKey,
      refine: array(SceneChecker),
    }),
  ],
})

const sceneIdsState = selector<Array<number>>({
  key: 'sceneIds',
  get: ({get}) => {
    const scenes = get(sceneListState)
    return scenes.map((it) => it.id)
  },
})

const scenesMappedByIdState = selector<Map<number, Scene>>({
  key: 'scenesMappedById',
  get: ({get}) => {
    const sceneList = get(sceneListState)
    return new Map(sceneList.map((scene => [scene.id, scene])))
  }
})

const sceneState = selectorFamily<Scene, number>({
  key: 'scene',
  get: (sceneId: number) => ({get}) => {
    const scenesMappedById = get(scenesMappedByIdState)
    const scene = scenesMappedById.get(sceneId)
    if (scene === undefined) {
      throw new Error("Scene not found")
    }
    return scene
  },
})

export function Scenes() {
  const [addSceneDialogOpen, setAddSceneDialogOpen] = useState<boolean>(false)
  const [sceneSaving, setSceneSaving] = useState<boolean>(false)

  return (
      <>
        <Suspense fallback={'Loading...'}>
          <AddSceneDialog open={addSceneDialogOpen} setOpen={setAddSceneDialogOpen} setSceneSaving={setSceneSaving}/>
        </Suspense>
        <Paper
            sx={{
              p: 2,
              m: 2,
              display: 'flex',
              flexDirection: 'column',
            }}>
          <Box>
            <Stack spacing={2} direction="row" sx={{float: "right"}}>
              <Button
                  variant="contained"
                  startIcon={<AddCircleIcon/>}
                  onClick={() => setAddSceneDialogOpen(true)}
              >Add Scene</Button>
            </Stack>
            <Typography variant="h2">
              Scenes
            </Typography>
            <Suspense fallback={'Loading...'}>
              <ScenesContainer/>
            </Suspense>
          </Box>
        </Paper>
      </>
  )
}

function ScenesContainer() {
  const sceneIds = useRecoilValue(sceneIdsState)

  return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Grid container spacing={3}>
          {sceneIds.map((sceneId) => (
            <Suspense fallback={'Loading...'} key={sceneId}>
              <SceneCard id={sceneId}/>
            </Suspense>
          ))}
        </Grid>
      </Container>
  )
}

const SceneCard = ({id}: {id: number}) => {
  interface StatusDetails {
    text: "ready" | "running..." | "active" | "failed",
    color: OverridableStringUnion<
        'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning',
        ChipPropsColorOverrides
    >,
  }

  const scene = useRecoilValue(sceneState(id))
  const [status, setStatus] = useState<StatusDetails>({
    text: "ready",
    color: "default",
  })

  const navigate = useNavigate()

  const doRun = () => {
    setStatus({
      text: "running...",
      color: "info",
    })

    lightingApi.scenes.run(id).then((runResult) => {
      setStatus({
        text: "active",
        color: "success",
      })
    }).catch((error) => {
      console.log(error)
      setStatus({
        text: "failed",
        color: "error",
      })
    })
  }

  if (status.text === "active") {
    if (!scene.isActive) {
      status.text = "ready"
      status.color = "default"
    }
  } else if (status.text === "ready") {
    if (scene.isActive) {
      status.text = "active"
      status.color = "success"
    }
  }

  const handleSceneDelete = () => {
    lightingApi.scenes.delete(id)
  }

  const handleViewScript = () => {
    navigate(`/scripts/${scene.scriptId}`)
  }

  const sx: SxProps<Theme> = {
    maxWidth: 345
  }
  if (scene.isActive) {
    sx.bgcolor = '#84bef5'
  }

  return (
      <Grid item xs={12} md={4} lg={3}>
        <Card sx={sx}>
          <CardActionArea onClick={doRun}>
            <CardContent>
              <Typography gutterBottom variant="h5" component="div">
                {scene.name}
              </Typography>
              <Suspense fallback={'Loading...'}>
                <SceneScriptDetails id={scene.scriptId}/>
              </Suspense>
              <Chip label={status.text} color={status.color} size="small" variant="outlined"  />
            </CardContent>
          </CardActionArea>
          <CardActions>
            <Button size="small" color="primary" onClick={handleViewScript}>
              View Script
            </Button>
            <Button size="small" color="error" onClick={handleSceneDelete}>
              Delete
            </Button>
          </CardActions>
        </Card>
      </Grid>
  )
}

const SceneScriptDetails = ({id}: {id: number}) => {
  const script = useRecoilValue(scriptState(id))

  return (
      <Typography sx={{ mb: 1.5 }} color="text.secondary">
        Run script '{script.name}'
      </Typography>
  )
}
