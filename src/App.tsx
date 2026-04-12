import React from "react"
import { Toaster } from "sonner"
import Layout from "./Layout"
import {createBrowserRouter, RouterProvider} from "react-router-dom";
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
import { ProjectPatches, PatchesRedirect } from "./routes/Patches";
import { ShowPage, ShowRedirect, LegacyCueStackRedirect } from "./routes/ShowPage";

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
          path: "projects/:projectId/patches",
          element: <ProjectPatches />,
        },
        {
          path: "patches",
          element: <PatchesRedirect />,
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
          path: "projects/:projectId/show",
          element: <ShowPage />,
        },
        {
          path: "projects/:projectId/show/sessions/:sessionId/program",
          element: <ShowPage />,
        },
        {
          path: "projects/:projectId/show/sessions/:sessionId/run",
          element: <ShowPage />,
        },
        {
          path: "show",
          element: <ShowRedirect />,
        },
        // Legacy redirects
        {
          path: "projects/:projectId/cue-stacks",
          element: <LegacyCueStackRedirect />,
        },
        {
          path: "cue-stacks",
          element: <ShowRedirect />,
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
