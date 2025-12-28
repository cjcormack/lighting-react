import React, { useState, useEffect, Dispatch, SetStateAction } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Stack,
  MenuItem,
  Typography,
  Divider,
  CircularProgress,
  Box,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import {
  useProjectQuery,
  useUpdateProjectMutation,
  useProjectScriptsQuery,
  useProjectScenesQuery,
  useCurrentProjectQuery,
  useCreateInitialSceneMutation,
  useCreateTrackChangedScriptMutation,
  useCreateRunLoopScriptMutation,
} from "./store/projects";

interface EditProjectDialogProps {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  projectId: number;
}

export default function EditProjectDialog({
  open,
  setOpen,
  projectId,
}: EditProjectDialogProps) {
  const { data: project, isLoading: isProjectLoading } = useProjectQuery(projectId, {
    skip: !open,
  });
  const { data: currentProject } = useCurrentProjectQuery();
  const { data: scripts, refetch: refetchScripts } = useProjectScriptsQuery(projectId, {
    skip: !open,
  });
  const { data: scenes, refetch: refetchScenes } = useProjectScenesQuery(projectId, {
    skip: !open,
  });
  const [updateProject, { isLoading: isUpdating }] = useUpdateProjectMutation();

  // Create mutations (only available for current project)
  const [createInitialScene, { isLoading: isCreatingInitialScene }] = useCreateInitialSceneMutation();
  const [createTrackChangedScript, { isLoading: isCreatingTrackChanged }] = useCreateTrackChangedScriptMutation();
  const [createRunLoopScript, { isLoading: isCreatingRunLoop }] = useCreateRunLoopScriptMutation();

  // Check if this is the current project
  const isCurrentProject = currentProject?.id === projectId;

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loadFixturesScriptId, setLoadFixturesScriptId] = useState<number | "">("");
  const [initialSceneId, setInitialSceneId] = useState<number | "">("");
  const [trackChangedScriptId, setTrackChangedScriptId] = useState<number | "">("");
  const [runLoopScriptId, setRunLoopScriptId] = useState<number | "">("");
  const [runLoopDelayMs, setRunLoopDelayMs] = useState<string>("");

  // Populate form when project loads
  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description || "");
      setLoadFixturesScriptId(project.loadFixturesScriptId || "");
      setInitialSceneId(project.initialSceneId || "");
      setTrackChangedScriptId(project.trackChangedScriptId || "");
      setRunLoopScriptId(project.runLoopScriptId || "");
      setRunLoopDelayMs(project.runLoopDelayMs?.toString() || "");
    }
  }, [project]);

  const handleClose = () => {
    setOpen(false);
  };

  const handleSave = async () => {
    if (loadFixturesScriptId === "") return; // Required field
    await updateProject({
      id: projectId,
      name,
      description: description || null,
      loadFixturesScriptId: loadFixturesScriptId,
      initialSceneId: initialSceneId === "" ? null : initialSceneId,
      trackChangedScriptId: trackChangedScriptId === "" ? null : trackChangedScriptId,
      runLoopScriptId: runLoopScriptId === "" ? null : runLoopScriptId,
      runLoopDelayMs: runLoopDelayMs ? parseInt(runLoopDelayMs, 10) : null,
    }).unwrap();
    handleClose();
  };

  const handleCreateInitialScene = async () => {
    const result = await createInitialScene().unwrap();
    setInitialSceneId(result.sceneId);
    refetchScripts();
    refetchScenes();
  };

  const handleCreateTrackChangedScript = async () => {
    const result = await createTrackChangedScript().unwrap();
    setTrackChangedScriptId(result.scriptId);
    refetchScripts();
  };

  const handleCreateRunLoopScript = async () => {
    const result = await createRunLoopScript().unwrap();
    setRunLoopScriptId(result.scriptId);
    refetchScripts();
  };

  const isValid = name.trim().length > 0 && loadFixturesScriptId !== "";
  const isCreating = isCreatingInitialScene || isCreatingTrackChanged || isCreatingRunLoop;

  if (isProjectLoading) {
    return (
      <Dialog open={open} onClose={handleClose}>
        <DialogContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        </DialogContent>
      </Dialog>
    );
  }

  // Filter scenes to only show SCENE mode (not CHASE) for initial scene
  const sceneOnlyScenes = scenes?.filter(s => s.mode === 'SCENE') || [];

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Configure Project: {project?.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <Typography variant="subtitle1" fontWeight="bold">
            Basic Information
          </Typography>
          <TextField
            label="Project Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            variant="standard"
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
            variant="standard"
          />

          <Divider />

          <Typography variant="subtitle1" fontWeight="bold">
            Startup Configuration
          </Typography>
          <TextField
            select
            label="Load Fixtures Script"
            value={loadFixturesScriptId}
            onChange={(e) => setLoadFixturesScriptId(e.target.value as number | "")}
            fullWidth
            required
            variant="standard"
            helperText="Script to run when project loads to configure fixtures (required)"
          >
            {scripts?.map((script) => (
              <MenuItem key={script.id} value={script.id}>
                {script.name}
              </MenuItem>
            ))}
          </TextField>
          <Box>
            <Stack direction="row" spacing={1} alignItems="baseline">
              <TextField
                select
                label="Initial Scene"
                value={initialSceneId}
                onChange={(e) => setInitialSceneId(e.target.value as number | "")}
                fullWidth
                variant="standard"
              >
                <MenuItem value="">None</MenuItem>
                {sceneOnlyScenes.map((scene) => (
                  <MenuItem key={scene.id} value={scene.id}>
                    {scene.name}
                  </MenuItem>
                ))}
              </TextField>
              {isCurrentProject && initialSceneId === "" && (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={isCreatingInitialScene ? <CircularProgress size={16} /> : <AddIcon />}
                  onClick={handleCreateInitialScene}
                  disabled={isCreating}
                  sx={{ whiteSpace: "nowrap" }}
                >
                  Create
                </Button>
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Scene to activate when project loads
            </Typography>
          </Box>

          <Divider />

          <Typography variant="subtitle1" fontWeight="bold">
            Runtime Configuration
          </Typography>
          <Box>
            <Stack direction="row" spacing={1} alignItems="baseline">
              <TextField
                select
                label="Track Changed Script"
                value={trackChangedScriptId}
                onChange={(e) => setTrackChangedScriptId(e.target.value as number | "")}
                fullWidth
                variant="standard"
              >
                <MenuItem value="">None</MenuItem>
                {scripts?.map((script) => (
                  <MenuItem key={script.id} value={script.id}>
                    {script.name}
                  </MenuItem>
                ))}
              </TextField>
              {isCurrentProject && trackChangedScriptId === "" && (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={isCreatingTrackChanged ? <CircularProgress size={16} /> : <AddIcon />}
                  onClick={handleCreateTrackChangedScript}
                  disabled={isCreating}
                  sx={{ whiteSpace: "nowrap" }}
                >
                  Create
                </Button>
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Script to run when music track changes
            </Typography>
          </Box>
          <Box>
            <Stack direction="row" spacing={1} alignItems="baseline">
              <TextField
                select
                label="Run Loop Script"
                value={runLoopScriptId}
                onChange={(e) => setRunLoopScriptId(e.target.value as number | "")}
                fullWidth
                variant="standard"
              >
                <MenuItem value="">None</MenuItem>
                {scripts?.map((script) => (
                  <MenuItem key={script.id} value={script.id}>
                    {script.name}
                  </MenuItem>
                ))}
              </TextField>
              {isCurrentProject && runLoopScriptId === "" && (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={isCreatingRunLoop ? <CircularProgress size={16} /> : <AddIcon />}
                  onClick={handleCreateRunLoopScript}
                  disabled={isCreating}
                  sx={{ whiteSpace: "nowrap" }}
                >
                  Create
                </Button>
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Script to run continuously in a loop
            </Typography>
          </Box>
          <TextField
            label="Run Loop Delay (ms)"
            type="number"
            value={runLoopDelayMs}
            onChange={(e) => setRunLoopDelayMs(e.target.value)}
            fullWidth
            variant="standard"
            helperText="Delay between run loop iterations"
            disabled={!runLoopScriptId}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isUpdating}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!isValid || isUpdating}
        >
          {isUpdating ? "Saving..." : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
