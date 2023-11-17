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
import Scripts from "./routes/Scripts";
import {LightingApiConnection} from "./connection";

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
