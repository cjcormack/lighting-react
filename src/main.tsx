import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { Provider } from "react-redux"
import { store } from "./store"
import { applyThemeClass, getInitialTheme } from "./lib/theme"

// Apply the stored (or system-preferred) theme before React mounts. The boot
// loading overlay renders before Layout's ThemeToggle effect runs, so without
// this the overlay would be light regardless of preference; this also removes
// the flash-of-light on normal loads. Resolution is shared with ThemeToggle.
applyThemeClass(getInitialTheme())

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
