import React, { Dispatch, SetStateAction, useState, useEffect } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useProjectListQuery, useCopyScriptMutation } from "./store/projects";

interface CopyScriptDialogProps {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  sourceProjectId: number;
  scriptId: number;
  scriptName: string;
}

export default function CopyScriptDialog({
  open,
  setOpen,
  sourceProjectId,
  scriptId,
  scriptName,
}: CopyScriptDialogProps) {
  const [targetProjectId, setTargetProjectId] = useState<number | "">("");
  const [newName, setNewName] = useState("");
  const { data: projects } = useProjectListQuery();
  const [copyScript, { isLoading, error, reset }] = useCopyScriptMutation();

  // Filter out the source project from targets
  const targetProjects = projects?.filter((p) => p.id !== sourceProjectId) ?? [];

  useEffect(() => {
    if (open) {
      setTargetProjectId("");
      setNewName("");
      reset();
    }
  }, [open, reset]);

  const handleClose = () => {
    setTargetProjectId("");
    setNewName("");
    setOpen(false);
  };

  const handleCopy = async () => {
    if (targetProjectId === "") return;

    try {
      await copyScript({
        projectId: sourceProjectId,
        scriptId,
        targetProjectId,
        newName: newName.trim() || undefined,
      }).unwrap();
      handleClose();
    } catch {
      // Error handled by mutation state
    }
  };

  const isValid = targetProjectId !== "";

  const errorMessage =
    error && "status" in error && error.status === 409
      ? "A script with this name already exists in the target project"
      : error
        ? "Failed to copy script"
        : undefined;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Copy Script to Project</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Copy &quot;{scriptName}&quot; to another project.
          </Typography>
          {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
          <FormControl fullWidth required variant="standard">
            <InputLabel id="target-project-label">Target Project</InputLabel>
            <Select
              labelId="target-project-label"
              value={targetProjectId}
              onChange={(e) => setTargetProjectId(e.target.value as number)}
              label="Target Project"
            >
              {targetProjects.map((project) => (
                <MenuItem key={project.id} value={project.id}>
                  {project.name}
                  {project.isCurrent && " (Active)"}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="New Name (optional)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            fullWidth
            variant="standard"
            placeholder={scriptName}
            helperText="Leave empty to keep the original name"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleCopy}
          variant="contained"
          disabled={!isValid || isLoading}
        >
          {isLoading ? "Copying..." : "Copy"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
