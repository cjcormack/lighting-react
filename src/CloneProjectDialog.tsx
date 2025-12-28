import React, { Dispatch, SetStateAction, useState, useEffect } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useCloneProjectMutation } from "./store/projects";

interface CloneProjectDialogProps {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  sourceProjectId: number;
  sourceProjectName: string;
}

export default function CloneProjectDialog({
  open,
  setOpen,
  sourceProjectId,
  sourceProjectName,
}: CloneProjectDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cloneProject, { isLoading, error, reset }] = useCloneProjectMutation();

  useEffect(() => {
    if (open) {
      setName(`Copy of ${sourceProjectName}`);
      setDescription("");
      reset();
    }
  }, [open, sourceProjectName, reset]);

  const handleClose = () => {
    setName("");
    setDescription("");
    setOpen(false);
  };

  const handleClone = async () => {
    try {
      await cloneProject({
        id: sourceProjectId,
        name,
        description: description || undefined,
      }).unwrap();
      handleClose();
    } catch {
      // Error handled by mutation state
    }
  };

  const isValid = name.trim().length > 0;

  const errorMessage =
    error && "status" in error && error.status === 409
      ? "A project with this name already exists"
      : error
        ? "Failed to clone project"
        : undefined;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Clone Project</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Clone &quot;{sourceProjectName}&quot; with all its scripts, scenes, and settings.
          </Typography>
          {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
          <TextField
            label="New Project Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            autoFocus
            variant="standard"
          />
          <TextField
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
            variant="standard"
            placeholder="Leave empty to use the original project's description"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleClone}
          variant="contained"
          disabled={!isValid || isLoading}
        >
          {isLoading ? "Cloning..." : "Clone"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
