import React from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Alert,
} from "@mui/material";

interface DeleteProjectConfirmDialogProps {
  open: boolean;
  projectName: string;
  isCurrent: boolean;
  isDeleting: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteProjectConfirmDialog({
  open,
  projectName,
  isCurrent,
  isDeleting,
  error,
  onConfirm,
  onCancel,
}: DeleteProjectConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel}>
      <DialogTitle>Delete Project?</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {isCurrent && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            This is the currently active project and cannot be deleted.
            Please switch to another project first.
          </Alert>
        )}
        <DialogContentText>
          Are you sure you want to delete the project &quot;{projectName}&quot;?
        </DialogContentText>
        <DialogContentText sx={{ mt: 2, color: "error.main" }}>
          This action cannot be undone. All scripts, scenes, and fixtures in this
          project will be permanently deleted.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={isDeleting}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          color="error"
          variant="contained"
          disabled={isCurrent || isDeleting}
        >
          {isDeleting ? "Deleting..." : "Delete"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
