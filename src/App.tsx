import React from "react"
import { Toaster } from "sonner"
import Layout from "./Layout"
import {createBrowserRouter, Navigate, RouterProvider, useParams} from "react-router-dom";
import { ChannelsRedirect, ChannelsBaseRedirect, ProjectChannels } from "./routes/Channels";
import { FixturesRedirect, ProjectFixtures } from "./routes/Fixtures";
import { GroupsRedirect, ProjectGroups } from "./routes/Groups";
import Projects from "./routes/Projects";
import ProjectScripts, { ScriptsRedirect } from "./routes/ProjectScripts";
import { ProjectFxLibrary, FxLibraryRedirect } from "./routes/FxLibrary";

import { FxRedirect, ProjectFxBusking } from "./routes/FxBusking";
import { PresetsRedirect, ProjectFxPresets } from "./routes/FxPresets";
import { CuesRedirect, CuesBaseRedirect, ProjectCues } from "./routes/Cues";
import ProjectOverview, { ProjectOverviewRedirect } from "./routes/ProjectOverview";
import { PatchesRedirect } from "./routes/Patches";
import { ProgramPage, ProgramRedirect } from "./routes/ProgramPage";
import { RunPage, RunRedirect, LegacyShowRedirect } from "./routes/RunPage";
import { SurfacesRedirect } from "./routes/Surfaces";
import { DiagnosticsRedirect } from "./routes/Diagnostics";
import { ProjectCloudSync, CloudSyncHubRedirect } from "./routes/CloudSync";
import { ProjectSettings, ProjectSettingsRedirect } from "./routes/ProjectSettings";
import { InstallSettings } from "./routes/InstallSettings";

function PatchesToSettings() {
  const { projectId } = useParams()
  return <Navigate to={`/projects/${projectId}/settings/patches`} replace />
}
function SurfacesToSettings() {
  const { projectId } = useParams()
  return <Navigate to={`/projects/${projectId}/settings/surfaces`} replace />
}
function ProjectSyncToHub() {
  const { projectId } = useParams()
  return <Navigate to={`/sync/projects/${projectId}`} replace />
}

function App() {
  const router = createBrowserRouter([
    {
      path: "/",
      element: <Layout />,
      children: [
        {
          index: true,
          element: <ProjectOverviewRedirect />,
        },
        {
          path: "projects/:projectId",
          element: <ProjectOverview />,
        },
        {
          path: "projects/:projectId/fixtures",
          element: <ProjectFixtures />,
        },
        {
          path: "projects/:projectId/groups",
          element: <ProjectGroups />,
        },
        {
          path: "groups",
          element: <GroupsRedirect />,
        },
        {
          path: "projects/:projectId/fx",
          element: <ProjectFxBusking />,
        },
        {
          path: "fx",
          element: <FxRedirect />,
        },
        {
          path: "projects/:projectId/presets",
          element: <ProjectFxPresets />,
        },
        {
          path: "presets",
          element: <PresetsRedirect />,
        },
        {
          path: "projects/:projectId/cues",
          element: <CuesBaseRedirect />,
        },
        {
          path: "projects/:projectId/cues/all",
          element: <ProjectCues />,
        },
        {
          path: "projects/:projectId/cues/standalone",
          element: <ProjectCues />,
        },
        {
          path: "projects/:projectId/cues/stacks/:stackId",
          element: <ProjectCues />,
        },
        {
          path: "cues",
          element: <CuesRedirect />,
        },
        {
          path: "projects/:projectId/settings",
          element: <ProjectSettings />,
        },
        {
          path: "projects/:projectId/settings/:tab",
          element: <ProjectSettings />,
        },
        {
          path: "settings",
          element: <ProjectSettingsRedirect />,
        },

        {
          path: "install",
          element: <InstallSettings />,
        },
        {
          path: "install/:tab",
          element: <InstallSettings />,
        },

        // Cloud sync hub now lives as the Sync tab inside Install Settings.
        // /sync remains as a back-compat redirect; the per-project drill-in
        // keeps its short URL since it's deep-linked from the hub.
        {
          path: "sync",
          element: <CloudSyncHubRedirect />,
        },
        {
          path: "sync/projects/:projectId",
          element: <ProjectCloudSync />,
        },

        // Legacy per-project paths — keep working but redirect to the new location.
        {
          path: "projects/:projectId/patches",
          element: <PatchesToSettings />,
        },
        {
          path: "projects/:projectId/surfaces",
          element: <SurfacesToSettings />,
        },
        {
          path: "projects/:projectId/diagnostics",
          element: <Navigate to="/install/diagnostics" replace />,
        },
        {
          path: "projects/:projectId/sync",
          element: <ProjectSyncToHub />,
        },

        // Legacy bare paths (no project context) — keep until Cmd+K migrates.
        {
          path: "patches",
          element: <PatchesRedirect />,
        },
        {
          path: "surfaces",
          element: <SurfacesRedirect />,
        },
        {
          path: "diagnostics",
          element: <DiagnosticsRedirect />,
        },
        {
          path: "projects/:projectId/channels/:universe",
          element: <ProjectChannels />,
        },
        {
          path: "channels",
          element: <ChannelsBaseRedirect />,
        },
        {
          path: "channels/:universe",
          element: <ChannelsRedirect />,
        },
        {
          path: "scripts/:scriptId?",
          element: <ScriptsRedirect />,
        },
        {
          path: "projects/:projectId/scripts/:scriptId?",
          element: <ProjectScripts />,
        },
        {
          path: "fx-library",
          element: <FxLibraryRedirect />,
        },
        {
          path: "projects/:projectId/fx-library",
          element: <ProjectFxLibrary />,
        },

        {
          path: "projects/:projectId/program",
          element: <ProgramPage />,
        },
        {
          path: "program",
          element: <ProgramRedirect />,
        },
        {
          path: "projects/:projectId/run",
          element: <RunPage />,
        },
        {
          path: "run",
          element: <RunRedirect />,
        },
        // Legacy redirects — all former Show routes land on /run
        {
          path: "projects/:projectId/show",
          element: <LegacyShowRedirect />,
        },
        {
          path: "show",
          element: <LegacyShowRedirect />,
        },
        {
          path: "projects/:projectId/cue-stacks",
          element: <LegacyShowRedirect />,
        },
        {
          path: "cue-stacks",
          element: <LegacyShowRedirect />,
        },
        {
          path: "fixtures",
          element: <FixturesRedirect />,
        },
        {
          path: "projects",
          element: <Projects />,
        },
      ],
    },
  ])

  return (
      <React.StrictMode>
        <RouterProvider router={router}/>
        <Toaster position="bottom-right" />
      </React.StrictMode>
  )
}

export default App
