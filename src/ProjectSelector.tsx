import React, { useState } from "react";
import {
  Box,
  IconButton,
  Tooltip,
  CircularProgress,
  Link,
  Stack,
  ListSubheader,
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import ListIcon from "@mui/icons-material/List";
import { useNavigate } from "react-router-dom";
import { useCurrentProjectQuery } from "./store/projects";
import EditProjectDialog from "./EditProjectDialog";

interface ProjectSelectorProps {
  collapsed?: boolean;
}

export default function ProjectSelector({ collapsed }: ProjectSelectorProps) {
  const navigate = useNavigate();
  const { data: currentProject, isLoading } = useCurrentProjectQuery();
  const [editOpen, setEditOpen] = useState(false);

  const handleManageProjects = () => {
    navigate("/projects");
  };

  const handleConfigureProject = () => {
    if (currentProject) {
      setEditOpen(true);
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ p: 2, display: "flex", justifyContent: "center" }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (collapsed) {
    return (
      <Box sx={{ p: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 }}>
        <Tooltip title={`Configure: ${currentProject?.name || "Project"}`} placement="right">
          <IconButton onClick={handleConfigureProject} disabled={!currentProject}>
            <SettingsIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="All Projects" placement="right">
          <IconButton onClick={handleManageProjects}>
            <ListIcon />
          </IconButton>
        </Tooltip>
      </Box>
    );
  }

  return (
    <>
      {currentProject && (
        <EditProjectDialog
          open={editOpen}
          setOpen={setEditOpen}
          projectId={currentProject.id}
        />
      )}
      <Box sx={{ py: 1 }}>
        <ListSubheader component="div" sx={{ lineHeight: 'inherit', pb: 0.5 }}>
          Project
        </ListSubheader>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2 }}>
          <Tooltip title="Configure current project">
            <Link
              component="button"
              variant="body2"
              onClick={handleConfigureProject}
              sx={{
                textAlign: "left",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flexGrow: 1,
                minWidth: 0,
              }}
            >
              {currentProject?.name || "No project"}
            </Link>
          </Tooltip>
          <Tooltip title="Configure current project">
            <IconButton size="small" onClick={handleConfigureProject} disabled={!currentProject}>
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="All projects">
            <IconButton size="small" onClick={handleManageProjects}>
              <ListIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>
    </>
  );
}
