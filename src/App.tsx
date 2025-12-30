import React from "react"
import Layout from "./Layout"
import {createBrowserRouter, RouterProvider} from "react-router-dom";
import Channels from "./routes/Channels";
import {Scenes} from "./routes/Scenes";
import {Fixtures} from "./routes/Fixtures";
import Projects from "./routes/Projects";
import ProjectScripts, { ScriptsRedirect } from "./routes/ProjectScripts";

function App() {
  const router = createBrowserRouter([
    {
      path: "/",
      element: <Layout />,
      children: [
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
          element: <Scenes mode={'SCENE'} />,
        },
        {
          path: "chases",
          element: <Scenes mode={'CHASE'} />,
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
