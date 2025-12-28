import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Container,
  Grid,
  Paper,
  Stack,
  Typography,
  Alert,
} from "@mui/material";
import React, { useState } from "react";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import {
  useProjectListQuery,
  useCurrentProjectQuery,
  useDeleteProjectMutation,
  useSetCurrentProjectMutation,
} from "../store/projects";
import { ProjectSummary } from "../api/projectApi";
import CreateProjectDialog from "../CreateProjectDialog";
import EditProjectDialog from "../EditProjectDialog";
import DeleteProjectConfirmDialog from "../DeleteProjectConfirmDialog";
import ProjectSwitchConfirmDialog from "../ProjectSwitchConfirmDialog";
import ViewProjectScriptsDialog from "../ViewProjectScriptsDialog";
import CloneProjectDialog from "../CloneProjectDialog";

export default function Projects() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  return (
    <>
      <CreateProjectDialog open={createDialogOpen} setOpen={setCreateDialogOpen} />
      <Paper
        sx={{
          p: 2,
          m: 2,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box>
          <Stack spacing={2} direction="row" sx={{ float: "right" }}>
            <Button
              variant="contained"
              startIcon={<AddCircleIcon />}
              onClick={() => setCreateDialogOpen(true)}
            >
              Create Project
            </Button>
          </Stack>
          <Typography variant="h2">Projects</Typography>
          <ProjectsContainer />
        </Box>
      </Paper>
    </>
  );
}

function ProjectsContainer() {
  const { data: projects, isLoading, error } = useProjectListQuery();

  if (isLoading) {
    return <>Loading...</>;
  }

  if (error) {
    return <Alert severity="error">Failed to load projects</Alert>;
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Grid container spacing={3}>
        {projects?.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </Grid>
    </Container>
  );
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [scriptsOpen, setScriptsOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);

  const { data: currentProject } = useCurrentProjectQuery();

  const [deleteProject, { isLoading: isDeleting, error: deleteError }] =
    useDeleteProjectMutation();
  const [setCurrentProject, { isLoading: isSwitching }] =
    useSetCurrentProjectMutation();

  const handleActivate = () => {
    if (!project.isCurrent) {
      setSwitchOpen(true);
    }
  };

  const handleConfirmSwitch = async () => {
    await setCurrentProject(project.id);
    setSwitchOpen(false);
  };

  const handleDelete = async () => {
    try {
      await deleteProject(project.id).unwrap();
      setDeleteOpen(false);
    } catch {
      // Error handled by dialog
    }
  };

  const is409Error =
    deleteError && "status" in deleteError && deleteError.status === 409;

  return (
    <>
      <EditProjectDialog
        open={editOpen}
        setOpen={setEditOpen}
        projectId={project.id}
      />
      <DeleteProjectConfirmDialog
        open={deleteOpen}
        projectName={project.name}
        isCurrent={project.isCurrent}
        isDeleting={isDeleting}
        error={is409Error ? "Cannot delete the currently active project" : undefined}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
      <ProjectSwitchConfirmDialog
        open={switchOpen}
        currentProjectName={currentProject?.name || ""}
        newProjectName={project.name}
        isSwitching={isSwitching}
        onConfirm={handleConfirmSwitch}
        onCancel={() => setSwitchOpen(false)}
      />
      <ViewProjectScriptsDialog
        open={scriptsOpen}
        setOpen={setScriptsOpen}
        projectId={project.id}
        projectName={project.name}
      />
      <CloneProjectDialog
        open={cloneOpen}
        setOpen={setCloneOpen}
        sourceProjectId={project.id}
        sourceProjectName={project.name}
      />
      <Grid size={{ xs: 12, md: 6, lg: 4 }}>
        <Card
          sx={{
            bgcolor: project.isCurrent ? "#e3f2fd" : undefined,
          }}
        >
          <CardContent>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h5" component="div">
                {project.name}
              </Typography>
              {project.isCurrent && (
                <Chip label="Active" color="primary" size="small" />
              )}
            </Stack>
            {project.description && (
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                {project.description}
              </Typography>
            )}
          </CardContent>
          <CardActions>
            {!project.isCurrent && (
              <Button size="small" color="primary" onClick={handleActivate}>
                Activate
              </Button>
            )}
            <Button size="small" onClick={() => setScriptsOpen(true)}>
              Scripts
            </Button>
            <Button size="small" onClick={() => setEditOpen(true)}>
              Configure
            </Button>
            <Button size="small" onClick={() => setCloneOpen(true)}>
              Clone
            </Button>
            <Button
              size="small"
              color="error"
              onClick={() => setDeleteOpen(true)}
              disabled={project.isCurrent}
            >
              Delete
            </Button>
          </CardActions>
        </Card>
      </Grid>
    </>
  );
}
