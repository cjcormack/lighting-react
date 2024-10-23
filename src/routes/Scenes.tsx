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
  Paper, Stack, SxProps, Theme,
  Typography
} from "@mui/material"
import React, {Suspense, useState} from "react";
import {OverridableStringUnion} from "@mui/types";
import {ChipPropsColorOverrides} from "@mui/material/Chip/Chip";
import AddCircleIcon from '@mui/icons-material/AddCircle';
import AddSceneDialog from "../AddSceneDialog";
import {useNavigate} from "react-router-dom";
import SetSceneSettings from "../SetSceneSettings";
import {
  useScriptQuery
} from "../store/scripts"
import {
  Scene, useDeleteSceneMutation,
  useRunSceneMutation,
  useSaveSceneMutation,
  useSceneListQuery
} from "../store/scenes"

export function Scenes() {
  const [addSceneDialogOpen, setAddSceneDialogOpen] = useState<boolean>(false)

  return (
      <>
        <Suspense fallback={'Loading...'}>
          <AddSceneDialog open={addSceneDialogOpen} setOpen={setAddSceneDialogOpen}/>
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
  const {
    data: sceneList,
    isLoading,
    isFetching
  } = useSceneListQuery()

  if (isLoading || isFetching) {
    return (
      <>Loading...</>
    )
  }

  return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Grid container spacing={3}>
          {sceneList?.map((scene) => (
            <SceneCard key={scene.id} scene={scene}/>
          ))}
        </Grid>
      </Container>
  )
}

const SceneCard = ({scene}: {scene: Scene}) => {
  interface StatusDetails {
    text: "ready" | "running..." | "active" | "failed",
    color: OverridableStringUnion<
        'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning',
        ChipPropsColorOverrides
    >,
  }

  const {
    data: script,
    isLoading: isScriptLoading,
    isFetching: isScriptFetching,
  } = useScriptQuery(scene.scriptId)

  const [
    runRunMutation,
    {
      isLoading: isRunning,
      isSuccess: isSuccess,
      isError: isError,
    }
  ] = useRunSceneMutation()

  const [runSaveMutation] = useSaveSceneMutation()

  const [runDeleteMigration] = useDeleteSceneMutation()

  const [showSettings, setShowSettings] = useState<boolean>(false)

  const status: StatusDetails  = {
    text: "ready",
    color: "default",
  }

  if (isRunning) {
    status.text = "running..."
    status.color = "info"
  } else if (isSuccess) {
    status.text = "active"
    status.color = "success"
  } else if (isError) {
    status.text = "failed"
    status.color = "error"
  }

  const navigate = useNavigate()

  const settingsValuesObject = scene.settingsValues as object

  const settingsValuesMap: Map<string, unknown> = new Map(Object.entries(settingsValuesObject))

  const doRun = () => {
    runRunMutation(scene.id)
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
    runDeleteMigration(scene.id)
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

  const saveSettingValues = (settingsValues: Map<string, unknown>) => {
    const newScene = {
      id: scene.id,
      name: scene.name,
      scriptId: scene.scriptId,
      settingsValues: Object.fromEntries(settingsValues.entries()),
    }
    runSaveMutation(newScene)
  }

  if (isScriptLoading || isScriptFetching) {
    return (
      <>Loading...</>
    )
  }
  if (!script) {
    return (
      <>Script not found</>
    )
  }

  return (
      <>
        <SetSceneSettings open={showSettings} setOpen={setShowSettings} settings={script.settings} originalSettingsValues={settingsValuesMap}
                          saveSettingValues={saveSettingValues} />
        <Grid item xs={12} md={4} lg={3}>
          <Card sx={sx}>
            <CardActionArea onClick={doRun}>
              <CardContent>
                <Typography gutterBottom variant="h5" component="div">
                  {scene.name}
                </Typography>
                <Typography sx={{ mb: 1.5 }} color="text.secondary">
                  Run script &apos;{script.name}&apos;
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Chip label={status.text} color={status.color} size="small" variant="outlined"  />
                  {
                    script.settings.map((setting) => {
                      const settingValue = settingsValuesMap.get(setting.name) ?? setting.defaultValue

                      return (
                        <Chip key={setting.name} label={`${setting.name}: ${settingValue}`} size="small" variant="outlined" />
                      )
                    })
                  }
                </Stack>
              </CardContent>
            </CardActionArea>
            <CardActions>
              {
                script.settings.length ? (
                  <Button size="small" color="primary" onClick={() => setShowSettings(true)}>
                    Settings
                  </Button>
                ) : (
                  <></>
                )
              }
              <Button size="small" color="primary" onClick={handleViewScript}>
                Script
              </Button>
              <Button size="small" color="error" onClick={handleSceneDelete}>
                Delete
              </Button>
            </CardActions>
          </Card>
        </Grid>
      </>
  )
}
