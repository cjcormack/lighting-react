import React from 'react';
import './App.css';

import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import Layout from "./Layout";
import {createBrowserRouter, RouterProvider} from "react-router-dom";
import Channels from "./routes/Channels";
import Scripts from "./routes/Scripts";
import {Scenes} from "./routes/Scenes";
import {Fixtures} from "./routes/Fixtures";

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
