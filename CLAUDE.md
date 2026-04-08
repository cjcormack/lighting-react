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
- Use Radix UI primitives (via `src/components/ui/`) and Tailwind for UI

### Navigation Registry
- All navigation items are defined in `src/navigation.ts`
- When adding a new page/route, add an entry to the `navItems` array in `src/navigation.ts`
- This automatically registers the page in both the sidebar and the Cmd+K command palette
- Dynamic items (e.g. universes) are handled by the `useNavItems()` hook

### Sheets vs Dialogs

Use **Sheets** (slide-in from right) for any UI that involves editing, forms, or multi-step workflows. Use **Dialogs** (centered modal) only for confirmations, alerts, and status displays.

#### Sheet structure

All sheets must follow this structure using the shared primitives from `src/components/ui/sheet.tsx`:

```tsx
<Sheet open={open} onOpenChange={onOpenChange}>
  <SheetContent className="flex flex-col sm:max-w-md">
    <SheetHeader>
      <SheetTitle>Title</SheetTitle>
    </SheetHeader>
    <SheetBody>
      {/* Scrollable form content — space-y-4 and px-4 pb-4 are built in */}
    </SheetBody>
    <SheetFooter className="flex-row justify-end gap-2">
      <Button variant="outline">Cancel</Button>
      <Button>Save</Button>
    </SheetFooter>
  </SheetContent>
</Sheet>
```

#### Key rules

- **SheetContent**: Always include `flex flex-col`. Use `sm:max-w-md` for standard forms, `sm:max-w-lg` for complex/wide content. On mobile, sheets are fullscreen by default (`w-full` in base class).
- **SheetBody**: Use for all scrollable content areas. It provides `flex-1 overflow-y-auto space-y-4 px-4 pb-4`. Override with `className="space-y-0 p-0"` only when embedding components that manage their own padding (e.g. EffectParameterForm, pickers).
- **SheetFooter patterns**:
  - Create/Edit (no delete): `className="flex-row justify-end gap-2"`
  - Edit with delete: `className="flex-row justify-between"` — Delete button on left, Cancel+Save on right in a `<div className="flex gap-2">`
  - Equal-width actions (busking): `className="flex-row gap-2"` with `flex-1` on each button
- **Buttons**: Use default size in footers (no `size="sm"`). Cancel is always `variant="outline"`. Delete is `variant="destructive"`.
- **Multi-step sheets**: Use `p-0 gap-0` on SheetContent when step 1 needs edge-to-edge content (e.g. picker lists). Use SheetBody in subsequent steps for form content.
- **Sub-view footers** (content embedded inside a parent sheet, e.g. CueEffectFlow): Use `<div className="border-t p-4 flex items-center gap-2">` since SheetFooter can only be a direct child of SheetContent.

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