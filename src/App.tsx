import React from "react"
import Layout from "./Layout"
import {createBrowserRouter, RouterProvider} from "react-router-dom";
import { ChannelsRedirect, ChannelsBaseRedirect, ProjectChannels } from "./routes/Channels";
import { FixturesRedirect, ProjectFixtures } from "./routes/Fixtures";
import Projects from "./routes/Projects";
import ProjectScripts, { ScriptsRedirect } from "./routes/ProjectScripts";
import { ProjectScenes, ScenesRedirect, ChasesRedirect } from "./routes/ProjectScenes";
import ProjectOverview, { ProjectOverviewRedirect } from "./routes/ProjectOverview";

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
          path: "scenes",
          element: <ScenesRedirect />,
        },
        {
          path: "chases",
          element: <ChasesRedirect />,
        },
        {
          path: "projects/:projectId/scenes",
          element: <ProjectScenes mode={'SCENE'} />,
        },
        {
          path: "projects/:projectId/chases",
          element: <ProjectScenes mode={'CHASE'} />,
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
      </React.StrictMode>
  )
}

export default App
