import React from "react"
import { Toaster } from "sonner"
import { AuthGate } from "./AuthGate"
import { BootGate } from "./BootGate"
import Layout from "./Layout"
import {createBrowserRouter, Navigate, useParams} from "react-router";
// v8 keeps the DOM-specific entry points in `react-router/dom`.
import {RouterProvider} from "react-router/dom";
import {
  ChannelsRedirect,
  ChannelsBaseRedirect,
  ProjectChannels,
  ProjectChannelsDefaultUniverse,
} from "./routes/Channels";
import { FixturesRedirect, ProjectFixtures } from "./routes/Fixtures";
import { FixturesListRedirect, ProjectFixturesList } from "./routes/FixturesList";
import { GroupsRedirect, ProjectGroups } from "./routes/Groups";
import { GroupsListRedirect, ProjectGroupsList } from "./routes/GroupsList";
import Projects from "./routes/Projects";
import ProjectScripts, { ScriptsRedirect } from "./routes/ProjectScripts";
import { ProjectFxLibrary, FxLibraryRedirect } from "./routes/FxLibrary";

import { FxRedirect, ProjectFxBusking } from "./routes/FxBusking";
import { PresetsRedirect, ProjectFxPresets } from "./routes/FxPresets";
import { SpeedMastersRedirect, ProjectSpeedMasters } from "./routes/SpeedMasters";
import { PalettesRedirect, PalettesTypeRedirect, ProjectPalettes } from "./routes/Palettes";
import ProjectOverview, { ProjectOverviewRedirect } from "./routes/ProjectOverview";
import { PatchesRedirect } from "./routes/Patches";
import { ProgramPage, ProgramRedirect, CuesLegacyRedirect } from "./routes/ProgramPage";
import { ProgrammerPage, ProgrammerRedirect } from "./routes/Programmer";
import { RunPage, RunRedirect, LegacyShowRedirect } from "./routes/RunPage";
import { PromptBookViewerPage, PromptBookRedirect } from "./routes/PromptBookPage";
import { SurfacesRedirect } from "./routes/Surfaces";
import { DiagnosticsRedirect } from "./routes/Diagnostics";
import { CloudSyncHubRedirect } from "./routes/CloudSync";
import { ProjectSettings, ProjectSettingsRedirect } from "./routes/ProjectSettings";
import { InstallSettings } from "./routes/InstallSettings";
import { ResetPasswordPage } from "./routes/ResetPasswordPage";
import { DeviceLoginPage } from "./routes/DeviceLoginPage";
import { Stage, StageRedirect } from "./routes/Stage";

function PatchesToSettings() {
  const { projectId } = useParams()
  return <Navigate to={`/projects/${projectId}/settings/patches`} replace />
}
function SurfacesToSettings() {
  const { projectId } = useParams()
  return <Navigate to={`/projects/${projectId}/settings/surfaces`} replace />
}
function ProjectSyncToSettings() {
  const { projectId } = useParams()
  return <Navigate to={`/projects/${projectId}/settings/sync`} replace />
}

// Pages reachable without an account, and without the show being up: the two phone-facing
// QR pages. `/reset/<token>` belongs to someone locked out of the desk; `/device/<token>` is
// a phone being signed in from it. Neither has a session, so neither gate may stand in front
// of them.
//
// Read once at module scope, which is safe only because these pages are siblings of the
// router's Layout rather than routes inside it, and because the one that finishes with a
// session (`/device/`) does so with `window.location.assign` — a document load, which
// re-evaluates this. **A react-router `navigate('/')` from either page would render the whole
// app with both gates bypassed.** `DeviceLoginPage`'s test pins the document-level navigation
// for exactly that reason.
//
// Matched as routes, not as a bare prefix: `/device/` with no token would otherwise render a
// blank screen with both gates off.
//
// **The `i` flag is not decoration.** React Router matches routes case-insensitively unless a
// route sets `caseSensitive: true`, which none of ours do — so `/Device/<token>` renders
// `DeviceLoginPage` either way. A case-sensitive flag here would leave both gates armed in front
// of it, and a phone keyboard that auto-capitalises the first letter of a hand-typed URL is
// exactly how that happens.
const publicPath = /^\/(reset|device)\/[^/]+\/?$/i.test(window.location.pathname)

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
          path: "projects/:projectId/fixtures/list",
          element: <ProjectFixturesList />,
        },
        {
          path: "fixtures/list",
          element: <FixturesListRedirect />,
        },
        {
          path: "projects/:projectId/fixtures",
          element: <ProjectFixtures />,
        },
        {
          path: "projects/:projectId/stage",
          element: <Stage />,
        },
        {
          path: "stage",
          element: <StageRedirect />,
        },
        {
          path: "projects/:projectId/groups/list",
          element: <ProjectGroupsList />,
        },
        {
          path: "groups/list",
          element: <GroupsListRedirect />,
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
          path: "projects/:projectId/speed-masters",
          element: <ProjectSpeedMasters />,
        },
        {
          path: "speed-masters",
          element: <SpeedMastersRedirect />,
        },
        // Palettes: one nav entry, four sibling type routes reached via the in-page switcher.
        // The bare project path belongs to no type — it redirects to the sticky one, which is
        // what keeps the redirect acyclic.
        {
          path: "projects/:projectId/palettes/:type",
          element: <ProjectPalettes />,
        },
        {
          path: "projects/:projectId/palettes",
          element: <PalettesTypeRedirect />,
        },
        {
          path: "palettes",
          element: <PalettesRedirect />,
        },
        // Legacy FX Cues routes — the view was folded into Program. Redirect to keep bookmarks alive.
        {
          path: "projects/:projectId/cues",
          element: <CuesLegacyRedirect />,
        },
        {
          path: "projects/:projectId/cues/all",
          element: <CuesLegacyRedirect />,
        },
        {
          path: "projects/:projectId/cues/standalone",
          element: <CuesLegacyRedirect />,
        },
        {
          path: "projects/:projectId/cues/stacks/:stackId",
          element: <CuesLegacyRedirect />,
        },
        {
          path: "cues",
          element: <ProgramRedirect />,
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

        // Cloud sync hub now lives as the Sync tab inside Install Settings, and the
        // per-project sync UI lives in Project Settings → Sync. /sync and the old
        // drill-in remain as back-compat redirects.
        {
          path: "sync",
          element: <CloudSyncHubRedirect />,
        },
        {
          path: "sync/projects/:projectId",
          element: <ProjectSyncToSettings />,
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
          element: <ProjectSyncToSettings />,
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
          path: "projects/:projectId/channels",
          element: <ProjectChannelsDefaultUniverse />,
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
          path: "projects/:projectId/program/stacks/:stackId",
          element: <ProgramPage />,
        },
        {
          path: "program",
          element: <ProgramRedirect />,
        },
        // Programmer: one nav entry (Values); the FX sibling is reached via the in-page
        // switcher, following the cards/list precedent.
        {
          path: "projects/:projectId/programmer",
          element: <ProgrammerPage view="values" />,
        },
        {
          path: "projects/:projectId/programmer/fx",
          element: <ProgrammerPage view="fx" />,
        },
        {
          path: "programmer",
          element: <ProgrammerRedirect />,
        },
        {
          path: "projects/:projectId/run",
          element: <RunPage />,
        },
        {
          path: "run",
          element: <RunRedirect />,
        },
        {
          path: "projects/:projectId/prompt-book",
          element: <PromptBookViewerPage />,
        },
        {
          path: "prompt-book",
          element: <PromptBookRedirect />,
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
    // Siblings of Layout, not children: a phone that scans one of these QRs has no session,
    // no project context, and no business rendering the sidebar or the ShowBar. Paired with
    // the `publicPath` bypass above, which keeps both gates out of their way.
    {
      path: "reset/:token",
      element: <ResetPasswordPage />,
    },
    {
      path: "device/:token",
      element: <DeviceLoginPage />,
    },
  ])

  return (
      <React.StrictMode>
        <AuthGate bypass={publicPath}>
          <BootGate bypass={publicPath}>
            <RouterProvider router={router}/>
          </BootGate>
        </AuthGate>
        <Toaster position="bottom-right" />
      </React.StrictMode>
  )
}

export default App
