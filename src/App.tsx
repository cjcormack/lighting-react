import React from "react"
import Layout from "./Layout"
import {createBrowserRouter, RouterProvider} from "react-router-dom";
import Channels from "./routes/Channels";
import {Fixtures} from "./routes/Fixtures";
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
          path: "channels/:universe",
          element: <Channels />,
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
          element: <Fixtures />,
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
