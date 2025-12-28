import React from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  CircularProgress,
} from "@mui/material";

interface ProjectSwitchConfirmDialogProps {
  open: boolean;
  currentProjectName: string;
  newProjectName: string;
  isSwitching: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ProjectSwitchConfirmDialog({
  open,
  currentProjectName,
  newProjectName,
  isSwitching,
  onConfirm,
  onCancel,
}: ProjectSwitchConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel}>
      <DialogTitle>Switch Project?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Are you sure you want to switch from &quot;{currentProjectName}&quot; to &quot;{newProjectName}&quot;?
        </DialogContentText>
        <DialogContentText sx={{ mt: 2, color: "warning.main" }}>
          This will stop all running scenes, clear effects, and black out DMX output.
          Any unsaved changes will be lost.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={isSwitching}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          disabled={isSwitching}
          startIcon={isSwitching ? <CircularProgress size={16} /> : null}
        >
          {isSwitching ? "Switching..." : "Switch Project"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
