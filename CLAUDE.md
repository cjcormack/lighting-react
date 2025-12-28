# Claude Code Configuration

## Project Overview

This is the React frontend for the DMX lighting controller system. The backend is located at `/Users/chris/Development/Personal/lighting7` (Kotlin/JVM).

## Tech Stack

- **React 18** with TypeScript
- **Vite** for bundling and development
- **Material-UI (MUI) v6** for UI components
- **Redux Toolkit** with RTK Query for state management and API calls
- **React Router v6** for routing
- **WebSockets** for real-time backend communication

## Project Structure

```
src/
├── api/              # API layer - WebSocket and REST communication
│   ├── lightingApi.ts    # Main API facade combining all sub-APIs
│   ├── internalApi.ts    # WebSocket connection management
│   └── *Api.ts           # Individual API modules (channels, scenes, etc.)
├── store/            # Redux store configuration and RTK Query slices
│   ├── index.ts          # Store configuration
│   ├── restApi.ts        # Base RTK Query API
│   └── *.ts              # Entity-specific query hooks
├── routes/           # Route components (pages)
│   ├── Channels.tsx      # DMX channel control
│   ├── Fixtures.tsx      # Fixture management
│   ├── Scenes.tsx        # Scenes and chases
│   └── Scripts.tsx       # Kotlin script editor
├── App.tsx           # Router configuration
├── Layout.tsx        # Main layout with navigation drawer
└── main.tsx          # Application entry point
```

## Development

### Prerequisites

- Node.js (check package.json for version)
- The lighting7 backend running on port 8413

### Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server with hot reload
npm run build        # Build for production (runs tsc first)
npm run preview      # Preview production build
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint issues
npm run format       # Format code with Prettier
npm run type-check   # Run TypeScript type checking
```

### Development Server

The Vite dev server proxies API requests:
- `/api/*` -> `http://localhost:8413/api/`
- `/kotlin-compiler-server/*` -> `http://localhost:8413/kotlin-compiler-server/`

WebSocket URL is automatically derived from the current host or can be overridden with `VITE_SOCKET_URL`.

## Key Features

### Scripts
Kotlin scripts for lighting automation. Uses an embedded Kotlin playground for editing with syntax highlighting, autocomplete, and in-browser compilation. Scripts can be compiled and run directly from the UI.

### Scenes & Chases
- **Scenes**: One-shot lighting configurations that run a script with specific settings
- **Chases**: Animated lighting sequences (same component, different mode)

Both use scripts as their base and allow configuring script settings per scene/chase.

### Fixtures
DMX fixture definitions - describes what channels a fixture uses and how to control it.

### Channels
Raw DMX channel control per universe. Shows all 512 channels with current values.

## API Communication

The app maintains a persistent WebSocket connection to the backend for:
- Real-time status updates
- Channel value streaming
- Track status updates

REST API is used for CRUD operations on scripts, scenes, fixtures, etc.

## Patterns and Conventions

### State Management
- Use RTK Query hooks (`useXxxQuery`, `useXxxMutation`) for all API interactions
- Queries auto-subscribe to WebSocket updates where relevant
- Avoid local state for data that should be synchronized with the backend

### Components
- Route components in `src/routes/`
- Shared/utility components in `src/`
- Use MUI components consistently for UI

### TypeScript
- Strict mode enabled
- Prefer explicit types over `any`
- Use interface for object shapes

## Backend API Reference

The backend exposes these main endpoints:

- `GET/POST/PUT/DELETE /api/scripts` - Script CRUD
- `GET/POST/PUT/DELETE /api/scenes` - Scene CRUD
- `GET/POST/PUT/DELETE /api/fixtures` - Fixture CRUD
- `GET/PUT /api/channels/{universe}` - Channel values
- `GET /api/universes` - Available DMX universes
- `POST /api/scripts/compile` - Compile a script
- `POST /api/scripts/run` - Run a script directly
- `POST /api/scenes/{id}/run` - Run a scene

WebSocket messages use JSON with a `type` field for message routing.