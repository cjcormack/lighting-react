import React, { Dispatch, SetStateAction, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Typography,
  CircularProgress,
  Chip,
  Stack,
  IconButton,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import {
  useProjectScriptsQuery,
  useProjectScriptQuery,
} from "./store/projects";
// @ts-expect-error - no type declarations for kotlinScript
import ReactKotlinPlayground from "./kotlinScript/index.mjs";
import CopyScriptDialog from "./CopyScriptDialog";

interface ViewProjectScriptsDialogProps {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  projectId: number;
  projectName: string;
}

export default function ViewProjectScriptsDialog({
  open,
  setOpen,
  projectId,
  projectName,
}: ViewProjectScriptsDialogProps) {
  const [selectedScriptId, setSelectedScriptId] = useState<number | null>(null);

  const handleClose = () => {
    setSelectedScriptId(null);
    setOpen(false);
  };

  const handleBack = () => {
    setSelectedScriptId(null);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          {selectedScriptId !== null && (
            <IconButton onClick={handleBack} size="small">
              <ArrowBackIcon />
            </IconButton>
          )}
          <Typography variant="h6" component="span">
            Scripts from &quot;{projectName}&quot;
          </Typography>
          <Chip label="Read-only" size="small" variant="outlined" />
        </Stack>
      </DialogTitle>
      <DialogContent dividers sx={{ minHeight: 400 }}>
        {selectedScriptId === null ? (
          <ScriptsList
            projectId={projectId}
            onSelectScript={setSelectedScriptId}
          />
        ) : (
          <ScriptViewer projectId={projectId} scriptId={selectedScriptId} />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

function ScriptsList({
  projectId,
  onSelectScript,
}: {
  projectId: number;
  onSelectScript: (scriptId: number) => void;
}) {
  const { data: scripts, isLoading } = useProjectScriptsQuery(projectId);

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!scripts || scripts.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ p: 2 }}>
        No scripts in this project.
      </Typography>
    );
  }

  return (
    <List>
      {scripts.map((script) => (
        <ListItemButton
          key={script.id}
          onClick={() => onSelectScript(script.id)}
        >
          <ListItemText
            primary={script.name}
            secondary={
              script.settingsCount > 0
                ? `${script.settingsCount} setting${script.settingsCount > 1 ? "s" : ""}`
                : "No settings"
            }
          />
        </ListItemButton>
      ))}
    </List>
  );
}

function ScriptViewer({
  projectId,
  scriptId,
}: {
  projectId: number;
  scriptId: number;
}) {
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const { data: script, isLoading } = useProjectScriptQuery({
    projectId,
    scriptId,
  });

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!script) {
    return (
      <Typography color="error" sx={{ p: 2 }}>
        Script not found.
      </Typography>
    );
  }

  const scriptPrefix = `import uk.me.cormack.lighting7.fixture.*
import uk.me.cormack.lighting7.fixture.dmx.*
import uk.me.cormack.lighting7.fixture.hue.*
import java.awt.Color
import uk.me.cormack.lighting7.dmx.*
import uk.me.cormack.lighting7.show.*
import uk.me.cormack.lighting7.scripts.*
import uk.me.cormack.lighting7.scriptSettings.*

class TestScript(
    fixtures: Fixtures.FixturesWithTransaction,
    scriptName:
    String,
    step: Int,
    sceneName: String,
    sceneIsActive: Boolean,
    settings: Map<String, String>
): LightingScript(fixtures, scriptName, step, sceneName, sceneIsActive, settings) {}

fun TestScript.test() {
//sampleStart
`;
  const scriptSuffix = `
//sampleEnd
}
`;

  return (
    <Box>
      <CopyScriptDialog
        open={copyDialogOpen}
        setOpen={setCopyDialogOpen}
        sourceProjectId={projectId}
        scriptId={scriptId}
        scriptName={script.name}
      />
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">
          {script.name}
        </Typography>
        <Button
          variant="outlined"
          size="small"
          onClick={() => setCopyDialogOpen(true)}
        >
          Copy to Project
        </Button>
      </Stack>
      {script.settings.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Settings
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {script.settings.map((setting) => (
              <Chip
                key={setting.name}
                label={`${setting.name}: ${setting.defaultValue ?? "—"}`}
                size="small"
                variant="outlined"
              />
            ))}
          </Stack>
        </Paper>
      )}
      <Paper variant="outlined">
        <ReactKotlinPlayground
          mode="kotlin"
          lines="true"
          value={scriptPrefix + script.script + scriptSuffix}
          highlightOnFly="true"
          readOnly="true"
          key={`${projectId}-${scriptId}`}
        />
      </Paper>
    </Box>
  );
}
