# Show Mode: Programming & Running

Show Mode is the production show programming and playback system. It lives at the `/cue-stacks` route under a single **Program / Show** tabbed layout, providing both a show assembly surface and a keyboard-driven cue runner.

## Design Model: Four Phases of Show Programming

The UI is structured around four distinct phases a lighting operator works through:

| Phase | Description | Primary Surface |
|-------|-------------|-----------------|
| Initial programming | Creating core looks (presets) for scenes | Presets view |
| Show assembly | Building cues in stacks from presets, adding FX and triggers | Program tab |
| Tech runs | Fine-tuning cues and sequence while running the show | Show tab |
| Production run | Stepping through cues live, no editing | Show tab |

A key insight: **tech runs live in the Show tab, not the Program tab**. A tech run is a running phase that occasionally requires a programming detour (via the CueForm sheet), not a programming phase that happens to involve running.

The **FX Cues view** (separate from Show Mode) remains as "back-of-house authoring" -- building and managing individual cues by combining presets into named, deployable looks. The **Program tab** is for assembling those cues into show order. Over time, the Program tab may absorb the FX Cues view's capabilities entirely.

## Concepts

**Show Session** -- a named container representing a single show or rehearsal. Contains an ordered list of **entries**, each being either a **STACK** reference (pointing to a cue stack) or a **MARKER** (a visual separator with a label). Only one session is active at a time.

**Cue Stack** -- an ordered sequence of cues. Has a `loop` flag (repeat after last cue) and a `palette` (inherited by all cues). Stacks are the playable unit -- the runner steps through one stack at a time.

**Cue** -- a single lighting state. Consists of:
- A palette snapshot (DMX channel values)
- Preset applications (named FX presets applied to fixture groups)
- Ad-hoc effects (inline effects not from the library)
- Triggers (scripts that run on cue activation/deactivation)
- Timing: fade duration, fade curve, auto-advance delay
- Metadata: cue number (Q1, Q2.5), notes

**Cue types**: `STANDARD` (a real cue) or `MARKER` (a visual separator within a stack).

## Architecture

### Three-Layer Model

```
Component Layer    Route + UI components (React)
                   |
Store Layer        RTK Query endpoints + Redux runner slice
                   |
API Layer          Type definitions + WebSocket subscription factories
```

### File Map

#### API Layer (types + WebSocket)
| File | Purpose |
|------|---------|
| `src/api/showSessionsApi.ts` | Show session types, request/response interfaces |
| `src/api/showSessionsWsApi.ts` | WebSocket: `showSessionListChanged`, `showSessionChanged` |
| `src/api/cueStacksApi.ts` | Cue stack and cue entry types |
| `src/api/cueStacksWsApi.ts` | WebSocket: `cueStackListChanged` |
| `src/api/cuesApi.ts` | Full cue types, input types, trigger types |
| `src/api/cuesWsApi.ts` | WebSocket: `cueListChanged` |
| `src/api/lightingApi.ts` | Central API hub -- composes all sub-APIs into a single `lightingApi` object |

#### Store Layer (state management)
| File | Purpose |
|------|---------|
| `src/store/showSessions.ts` | RTK Query: session CRUD, entry management, playback control |
| `src/store/cueStacks.ts` | RTK Query: stack CRUD, cue reorder, activate/deactivate/advance |
| `src/store/cues.ts` | RTK Query: cue CRUD |
| `src/store/runnerSlice.ts` | Redux slice: per-stack runner state (active, standby, progress) |

#### Component Layer (UI)
| File | Purpose |
|------|---------|
| `src/routes/CueStackRunner.tsx` | Main route: session picker, tab bar, Show tab runner, keyboard handler |
| `src/components/runner/ShowBar.tsx` | Top control bar: DBO, BPM/TAP, cue info, GO/BACK buttons |
| `src/components/runner/CueRow.tsx` | Cue list row with status icons and fade progress bars |
| `src/components/runner/MarkerRow.tsx` | Marker separator row |
| `src/components/runner/OutOfOrderBanner.tsx` | Warning when cue numbers are not ascending |
| `src/components/runner/EditorPanel.tsx` | Inline edit mode UI |
| `src/components/runner/program/ProgramView.tsx` | Program tab: routes between SessionOverview and StackDetail |
| `src/components/runner/program/SessionOverview.tsx` | Session entry list with drag reorder, stack picker, marker edit |
| `src/components/runner/program/StackDetail.tsx` | Cue list within a stack, dnd-kit reorder, add cue/marker |
| `src/components/runner/program/ProgramCueRow.tsx` | Expandable cue row with CueFxTable, count badges |
| `src/components/runner/program/ProgramMarkerRow.tsx` | Interactive marker with inline rename/delete |
| `src/components/cues/CueForm.tsx` | Cue edit sheet (properties, presets, effects, triggers) |
| `src/hooks/useRunnerAnimation.ts` | requestAnimationFrame hook for fade/auto-advance progress |
| `src/lib/cueUtils.ts` | `buildCueInput()` -- converts a Cue to CueInput for mutations |

#### Navigation
Show is registered in `src/navigation.ts` with `path: /projects/${p}/cue-stacks` and `visibility: "active-only"`.

## Data Model

### ShowSessionDetails
```typescript
interface ShowSessionDetails {
  id: number
  name: string
  sessionType: string
  activeEntryId: number | null    // Currently playing entry
  entries: ShowSessionEntryDto[]
  canEdit: boolean
  canDelete: boolean
}

interface ShowSessionEntryDto {
  id: number
  entryType: 'STACK' | 'MARKER'
  sortOrder: number
  label: string | null            // Marker label
  cueStackId: number | null       // Stack ID (STACK entries only)
  cueStackName: string | null     // Stack name (STACK entries only)
}
```

### CueStack
```typescript
interface CueStack {
  id: number
  name: string
  palette: string[]
  loop: boolean
  cues: CueStackCueEntry[]
  activeCueId: number | null      // Server-tracked active cue
  canEdit: boolean
  canDelete: boolean
}

interface CueStackCueEntry {
  id: number
  name: string
  sortOrder: number
  paletteSize: number
  presetCount: number
  adHocEffectCount: number
  autoAdvance: boolean
  autoAdvanceDelayMs: number | null
  fadeDurationMs: number | null
  fadeCurve: string               // LINEAR, EASE_IN_OUT, SINE_IN_OUT, etc.
  cueNumber: string | null        // Theatre cue number (Q1, Q2.5)
  notes: string | null
  cueType: 'STANDARD' | 'MARKER'
}
```

### Cue (full detail)
```typescript
interface Cue {
  id: number
  name: string
  palette: string[]
  updateGlobalPalette: boolean
  presetApplications: CuePresetApplicationDetail[]
  adHocEffects: CueAdHocEffect[]
  triggers: CueTriggerDetail[]
  cueStackId: number | null
  cueStackName: string | null
  sortOrder: number
  autoAdvance: boolean
  autoAdvanceDelayMs: number | null
  fadeDurationMs: number | null
  fadeCurve: string
  cueNumber: string | null
  notes: string | null
  canEdit: boolean
  canDelete: boolean
}
```

### Cue Composition Types

**Preset applications** apply named FX presets to fixture groups, with optional timing:

```typescript
interface CuePresetApplicationDetail {
  presetId: number
  presetName: string | null
  targets: CueTarget[]           // { type: 'group' | 'fixture', key: string }
  delayMs?: number | null
  intervalMs?: number | null
  randomWindowMs?: number | null
  sortOrder?: number
}
```

**Ad-hoc effects** are inline effects stored directly on the cue (not from the library):

```typescript
interface CueAdHocEffect {
  targetType: 'group' | 'fixture'
  targetKey: string
  effectType: string
  category: string
  propertyName: string | null
  beatDivision: number
  blendMode: string
  distribution: string
  phaseOffset: number
  parameters: Record<string, string>
  delayMs?: number | null         // Optional timed trigger
  intervalMs?: number | null
  randomWindowMs?: number | null
}
```

All three composition types (presets, ad-hoc effects, triggers) support optional timing fields (`delayMs`, `intervalMs`, `randomWindowMs`) for delayed or recurring execution.

### Triggers
```typescript
type TriggerType = 'ACTIVATION' | 'DEACTIVATION'

interface CueTriggerDetail {
  triggerType: TriggerType
  scriptId: number
  scriptName?: string | null
  delayMs?: number | null
  intervalMs?: number | null
  randomWindowMs?: number | null
  sortOrder?: number
}
```

### Runner State (per-stack, frontend only)
```typescript
interface StackRunnerState {
  activeCueId: number | null      // Cue currently fading in
  standbyCueId: number | null     // Next cue queued for GO
  completedCueIds: number[]       // Cues that have finished
  fadeProgress: number            // 0.0 - 1.0
  autoProgress: number | null     // 0.0 - 1.0 (auto-advance countdown)
}
```

## Program Tab

The Program tab is the show assembly surface. It has two levels:

**Session Overview** (`SessionOverview.tsx`) -- shown when a session is active and no stack is drilled into:
- Inline-editable session name (debounced 400ms)
- Ordered entry list with drag-to-reorder (dnd-kit)
- STACK entries: show cue count, loop/sequential badge, drill chevron, remove button
- MARKER entries: inline-editable label, remove button
- "Add Stack" opens a slide-in stack picker overlay with search filtering
- "Add Marker" appends a new marker entry
- "Ready to run" button switches to Show tab

**Stack Detail** (`StackDetail.tsx`) -- shown when drilling into a specific stack:
- Full cue list with drag-to-reorder
- Each row shows cue number, name, fade info, count badges (presets, effects, triggers)
- ProgramCueRow expands on chevron click to show CueFxTable inline
- Click the row itself to open CueForm sheet for full editing
- "+ Add Cue" creates a blank cue and opens CueForm
- "+ Add Separator" creates a MARKER cue
- Back arrow returns to session overview

## Show Tab (Runner)

The Show tab is the production playback surface. Layout from top to bottom:

### ShowBar
Top control surface with:
- **DBO** (Dead Blackout) toggle
- **BPM display** + **TAP** button for tempo
- **Cue info**: active cue name (amber), standby cue (green), next stack hint
- **Keyboard hints**: `<- back`, `space: go`
- **BACK** button
- **GO** button (large, green)

### Session Entry Strip
Horizontal tab bar mapping `activeSession.entries`:
- STACK entries render as clickable tabs (active state from `activeEntryId`)
- MARKER entries render as non-interactive dividers (vertical lines + label)
- Loop indicator icon on looping stacks
- Theatre/Band context toggle on the right

### Cue List
Scrollable list of cues in the active stack:
- Status icons: play (active/amber), diamond (standby/green), check (done/greyed)
- Fade progress bar (amber) on active cue
- Auto-advance countdown bar (blue) on active cue

### Theatre vs Band Mode
A per-stack toggle on the entry strip controls the display density:
- **Theatre**: shows Q number column, notes column, detailed fade info -- designed for scripted shows with numbered cues
- **Band**: minimal display, hides Q numbers and notes -- designed for live performance where cue names and effect counts are sufficient

## Playback Flow

### GO Command
Keyboard: `Space` | Button: `GO`

1. **Normal GO** (standbyCueId exists):
   - Redux: `go()` -- moves standby to active, computes next standby
   - Backend: `POST /cue-stacks/{id}/activate` (first GO) or `POST /cue-stacks/{id}/advance` (subsequent)
   - Animation starts fade progress from 0

2. **Boundary GO** (standbyCueId is null, end of stack):
   - ShowBar shows `-> {nextStackName}` hint in green
   - Redux: cancels animations, sets `activeEntryId` to next STACK entry
   - Backend: `POST /show-sessions/{id}/advance` (direction: FORWARD)
   - WS event confirms the entry switch

### BACK Command
Keyboard: `ArrowLeft` | Button: `BACK`

- If mid-fade (activeCueId exists): cancels fade, returns cue to standby
- If idle (no activeCueId): moves standby cursor back to previous cue
- Backend: `POST /cue-stacks/{id}/advance` (direction: BACKWARD)
- BACK never crosses stack boundaries automatically

### Auto-Advance
When a cue has `autoAdvance: true`:
1. After fade completes, starts countdown timer (`autoAdvanceDelayMs`)
2. Blue progress bar shows countdown
3. On expiry, auto-fires GO

### Stack Switching (entry strip click)
1. Deactivates current stack on backend if active
2. Calls `POST /show-sessions/{id}/go-to` with target entry ID
3. Runner state resets: standby = first cue, completed = empty

## Session Management

### Session Lifecycle
1. **No active session**: session picker is shown (centered UI)
   - Create: inline name input + Create button (autofocused, Enter submits)
   - Resume: existing sessions listed with Activate buttons
2. **Active session**: tab bar shows Deactivate button + green dot + session name
3. **Deactivate**: clears local state, calls backend `deactivate` if session was running

### Initial Load Sync
On mount, auto-picks the previously-active session using heuristic: `sessions.find(s => s.activeEntryId != null)`. Active session state is tracked locally via `activeSessionId` -- the backend does not have an `isActive` field.

## REST API Endpoints

### Show Sessions
```
GET    /project/{id}/show-sessions                          List all sessions
GET    /project/{id}/show-sessions/{sessionId}              Get session details
POST   /project/{id}/show-sessions                          Create session
PUT    /project/{id}/show-sessions/{sessionId}              Update name/type
DELETE /project/{id}/show-sessions/{sessionId}              Delete session

POST   /project/{id}/show-sessions/{sid}/add-stack          Add stack entry
POST   /project/{id}/show-sessions/{sid}/add-marker         Add marker entry
PUT    /project/{id}/show-sessions/{sid}/entries/{eid}      Update entry label/order
DELETE /project/{id}/show-sessions/{sid}/entries/{eid}      Remove entry
POST   /project/{id}/show-sessions/{sid}/reorder            Reorder entries

POST   /project/{id}/show-sessions/{sid}/activate           Start session playback
POST   /project/{id}/show-sessions/{sid}/deactivate         Stop session playback
POST   /project/{id}/show-sessions/{sid}/advance            GO to next/prev stack entry
POST   /project/{id}/show-sessions/{sid}/go-to              Jump to specific entry
```

### Cue Stacks
```
GET    /project/{id}/cue-stacks                             List all stacks
GET    /project/{id}/cue-stacks/{stackId}                   Get stack details
POST   /project/{id}/cue-stacks                             Create stack
PUT    /project/{id}/cue-stacks/{stackId}                   Update stack
DELETE /project/{id}/cue-stacks/{stackId}                   Delete stack

POST   /project/{id}/cue-stacks/{sid}/reorder               Reorder cues
POST   /project/{id}/cue-stacks/{sid}/add-cue               Add cue to stack
POST   /project/{id}/cue-stacks/{sid}/remove-cue            Remove cue from stack
POST   /project/{id}/cue-stacks/{sid}/sort-by-cue-number    Sort cues by Q number

POST   /project/{id}/cue-stacks/{sid}/activate              Start stack playback
POST   /project/{id}/cue-stacks/{sid}/deactivate            Stop stack playback
POST   /project/{id}/cue-stacks/{sid}/advance               GO forward/backward
POST   /project/{id}/cue-stacks/{sid}/go-to                 Jump to specific cue
```

### Cues
```
GET    /project/{id}/cues                                   List all cues
GET    /project/{id}/cues/{cueId}                           Get cue details
POST   /project/{id}/cues                                   Create cue
PUT    /project/{id}/cues/{cueId}                           Update cue
DELETE /project/{id}/cues/{cueId}                           Delete cue
POST   /project/{id}/cues/{cueId}/copy                     Duplicate cue
```

## WebSocket Events

All messages are JSON with a `type` field, received on the shared WebSocket connection.

| Message Type | Payload | Effect |
|-------------|---------|--------|
| `showSessionListChanged` | (none) | Invalidates `ShowSessionList` RTK Query tag |
| `showSessionChanged` | `sessionId`, `activeEntryId`, `activatedStackId`, `activatedStackName` | Updates `activeEntryId` in real-time via subscription callback |
| `cueStackListChanged` | (none) | Invalidates `CueStackList` RTK Query tag |
| `cueListChanged` | (none) | Invalidates `CueList` RTK Query tag |

### Subscription Pattern
Each WS API module exposes `subscribe(fn)` which returns a `{ unsubscribe }` handle. The store layer subscribes globally to invalidate RTK Query tags. Components subscribe locally for real-time state updates (e.g., `CueStackRunner` subscribes to `showSessionChanged` to track `activeEntryId`).

## State Management

### RTK Query Cache
All CRUD operations go through RTK Query with tag-based cache invalidation:
- `ShowSessionList` -- invalidated by any session mutation or WS `showSessionListChanged`
- `CueStackList` -- invalidated by stack mutations or WS `cueStackListChanged`
- `CueList` -- invalidated by cue mutations or WS `cueListChanged`
- `FixtureEffects`, `GroupActiveEffects` -- invalidated by playback mutations (activate, advance, deactivate)

### Optimistic Updates
Several mutations apply optimistic cache patches for instant UI feedback:
- `activateCueStack`: immediately sets `activeCueId` on the stack
- `deactivateCueStack`: immediately clears `activeCueId`
- `advanceCueStack`: computes next cue locally, patches cache
- `reorderCueStackCues`: immediately rewrites `sortOrder` in cue list cache

All optimistic updates are rolled back on server error.

### Runner Redux Slice
The `runnerSlice` manages per-stack playback state entirely on the frontend:
- `go`: moves standby -> active, computes next standby (respects loop flag, skips MARKERs)
- `back`: reverses cursor (mid-fade: active -> standby; idle: standby -> previous)
- `resetStack`: initializes runner for a stack, optionally restoring from server `activeCueId`
- `markDone`: marks fade complete, clears active
- `reconcileActiveCue`: syncs with server-reported active cue if it differs from local state

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Tabs within `/cue-stacks`, not separate routes | Shared state (session, stacks, cues) avoids redundant loading; quick context switching during tech runs |
| Session-driven stack strip (not all-stacks) | Show tab only displays stacks in the active session, in session order, with marker dividers |
| Right-side Sheet for cue editing | Matches existing Sheet pattern used throughout the app |
| Expandable rows in Program tab | Allows the Program tab to eventually replace the FX Cues view |
| BACK never crosses stack boundaries | Intentional safety constraint -- only GO advances between stacks |
| Local `activeSessionId` state | Backend doesn't have an `isActive` field; tracked locally with `activeEntryId != null` heuristic on reload |
| `stackMap` for O(1) lookups | UseMemo'd `Map<number, CueStack>` avoids repeated `.find()` in entry strip and session overview |

## Known Gaps

1. **No script quick-fire panel** -- no way to fire scripts ad-hoc during a show without attaching them to a cue trigger.
2. **Backend `isActive` field** -- active session is tracked locally via `activeSessionId` state. Adding a server-side `isActive` boolean on `ShowSessionDetails` would allow session state to persist across page reloads and sync across tabs/clients. Current workaround: `sessions.find(s => s.activeEntryId != null)` heuristic on mount.
3. **Boundary GO end-to-end** -- `advanceShowSession` has only been tested locally; needs full lifecycle verification with the backend.
