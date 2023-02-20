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
import {Connection} from "./connection";

function App() {
  const router = createBrowserRouter([
    {
      path: "/",
      element: <Layout />,
      children: [
        {
          path: "channels",
          element: <Channels />,
        },
        {
          path: "scripts",
          element: <Scripts />,
        },
      ],
    },
  ]);

  return (
      <React.StrictMode>
        <RecoilRoot>
          <Connection>
            <RouterProvider router={router}/>
          </Connection>
        </RecoilRoot>
      </React.StrictMode>
  );
}

export default App;
