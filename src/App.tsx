import React from 'react';
import './App.css';
import {RecoilRoot} from "recoil";

import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import Layout from "./Layout";
import {createBrowserRouter, RouterProvider} from "react-router-dom";
import Channels from "./routes/Channels";
import {LightingApiConnection} from "./connection";
import Scripts from "./routes/Scripts";
import {Scenes} from "./routes/Scenes";

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
          element: <Scripts />,
        },
        {
          path: "scenes",
          element: <Scenes />,
        },
      ],
    },
  ])

  return (
      <React.StrictMode>
        <RecoilRoot>
          <LightingApiConnection>
            <RouterProvider router={router}/>
          </LightingApiConnection>
        </RecoilRoot>
      </React.StrictMode>
  )
}

export default App
