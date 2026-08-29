import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { Provider } from "react-redux"
import { store } from "./store"
import { applyThemeClass, getInitialTheme } from "./lib/theme"
import { startOAuthIdentityBridge } from "./store/oauthGithub"
import { startLooksBridge } from "./store/looks"
import { startTemplatesBridge } from "./store/templates"
import { startProgrammerErrorBridge } from "./store/programmerErrors"

// Apply the stored (or system-preferred) theme before React mounts. The boot
// loading overlay renders before Layout's ThemeToggle effect runs, so without
// this the overlay would be light regardless of preference; this also removes
// the flash-of-light on normal loads. Resolution is shared with ThemeToggle.
applyThemeClass(getInitialTheme())

// Keep the GitHub identity cache live for the whole app, so the sidebar badge and the re-auth
// banner learn about a rejected authorisation without a sync page being open. Started here
// rather than on import of the slice: see startOAuthIdentityBridge for why touching lightingApi
// at that module's evaluation time breaks the slice outright.
startOAuthIdentityBridge()

// Same reason, one slice along: store/looks is imported from the sidebar's nav registry and from
// pickers that mount everywhere, so its WS bridge cannot run at module-eval time either.
startLooksBridge()
startTemplatesBridge()

// The programmer's WS write path reports its refusals on `programmer.error` and nothing else —
// there is no REST action for `errorToastMiddleware` to catch — so an unheard frame means a
// slider that moved while the rig did not. See startProgrammerErrorBridge.
startProgrammerErrorBridge()

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);
