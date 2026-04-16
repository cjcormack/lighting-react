# Show Mode: Programming & Running

Show Mode is the production show programming and playback system. It's split across two sibling routes, each with its own sidebar entry:

- `/projects/:projectId/program` — the **Program view**: show assembly (ordering stacks, editing cues, tech-run detours). Start the show from the header Start button.
- `/projects/:projectId/run` — the **Run view**: keyboard-driven cue runner. When the show isn't running, this view shows a large Start CTA hero instead of the runner; when it is running, it shows the runner with a Stop button in the header.

Splitting the two surfaces (rather than toggling between them via tabs on a single `/show` route) makes the running/stopped state obvious at a glance, puts the Start control where it's easy to find, and lets each view have its own primary action without conditional UI in the header.

**A project IS a show.** There is no separate ShowSession concept — show entries belong directly to the project. The show is "running" when the project's `activeEntryId` is non-null, broadcast via WebSocket so reloads and other browser tabs see the same state automatically.

## Design Model: Four Phases of Show Programming

The UI is structured around four distinct phases a lighting operator works through:

| Phase | Description | Primary Surface |
|-------|-------------|-----------------|
| Initial programming | Creating core looks (presets) for scenes | Presets view |
| Show assembly | Building cues in stacks from presets, adding FX and triggers | Program view |
| Tech runs | Fine-tuning cues and sequence while running the show | Run view (with occasional jumps to Program) |
| Production run | Stepping through cues live, no editing | Run view |

A key insight: **tech runs live on the Run view, not the Program view**. A tech run is a running phase that occasionally requires a programming detour (switch to Program via the sidebar, edit in the CueForm sheet, come back), not a programming phase that happens to involve running.

The **FX Cues view** (separate from Show Mode) remains as "back-of-house authoring" -- building and managing individual cues by combining presets into named, deployable looks. The **Program view** is for assembling those cues into show order. Over time, the Program view may absorb the FX Cues view's capabilities entirely.

## Concepts

**Show** -- the project's ordered list of **entries**, each being either a **STACK** reference (pointing to a cue stack) or a **MARKER** (a visual separator with a label). The show is active when the project has an `activeEntryId` set.

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
| `src/api/showApi.ts` | Show types, request/response interfaces |
| `src/api/showWsApi.ts` | WebSocket: `showEntriesChanged`, `showChanged` |
| `src/api/cueStacksApi.ts` | Cue stack and cue entry types |
| `src/api/cueStacksWsApi.ts` | WebSocket: `cueStackListChanged` |
| `src/api/cuesApi.ts` | Full cue types, input types, trigger types |
| `src/api/cuesWsApi.ts` | WebSocket: `cueListChanged` |
| `src/api/lightingApi.ts` | Central API hub -- composes all sub-APIs into a single `lightingApi` object |

#### Store Layer (state management)
| File | Purpose |
|------|---------|
| `src/store/show.ts` | RTK Query: show entry management, activate/deactivate/advance/go-to |
| `src/store/cueStacks.ts` | RTK Query: stack CRUD, cue reorder, activate/deactivate/advance |
| `src/store/cues.ts` | RTK Query: cue CRUD |
| `src/store/runnerSlice.ts` | Redux slice: per-stack runner state (active, standby, progress) |

#### Component Layer (UI)
| File | Purpose |
|------|---------|
| `src/routes/ProgramPage.tsx` | Route for `/projects/:projectId/program`. Hosts the show assembly surface: breadcrumb (`Program`), header Start Show button (or muted "Show running" chip when active), body = `ProgramView` (ShowOverview / StackDetail) with drill state, shared CueForm sheet. Start Show navigates to `/run` on success. |
| `src/routes/RunPage.tsx` | Route for `/projects/:projectId/run`. Breadcrumb (`Run`), header Stop button (when active), body = a Start CTA hero when inactive, or the runner when active. The runner swaps to `ShowRunnerMobile` when the runner container width drops below 600px. Owns keyboard handler, runner animation, entry switching, and a CueForm sheet used by the mobile cue-list edit flow. |
| `src/components/runner/ShowBar.tsx` | Top control bar: DBO, BPM/TAP, cue info, GO/BACK buttons (desktop runner) |
| `src/components/runner/CueRow.tsx` | Cue list row with status icons, fade progress bars, click-to-requeue, and eye-icon detail view (desktop runner) |
| `src/components/runner/MarkerRow.tsx` | Marker separator row (shared desktop + mobile) |
| `src/components/runner/OutOfOrderBanner.tsx` | Warning when cue numbers are not ascending |
| `src/components/runner/ShowRunnerMobile.tsx` | Remote-control layout for narrow containers: top strip, active-cue hero, standby card, GO/BACK footer with safe-area padding |
| `src/components/runner/StackPickerSheet.tsx` | Bottom sheet listing show entries for mobile stack switching |
| `src/components/runner/MobileCueListSheet.tsx` | Bottom sheet exposing the full cue list on mobile; tapping a cue opens CueForm |
| `src/components/runner/MobileCueRow.tsx` | Lean cue row used inside `MobileCueListSheet` (no fixed notes/auto-pill columns) |
| `src/components/runner/program/ProgramView.tsx` | Program body: routes between ShowOverview and StackDetail based on `drillStackId` |
| `src/components/runner/program/ShowOverview.tsx` | Show entry list with drag reorder, stack picker, marker edit. Activation controls live in `ProgramPage`'s header, not here. |
| `src/components/runner/program/StackDetail.tsx` | Cue list within a stack, dnd-kit reorder, add cue/marker, "Stacks" back button |
| `src/components/runner/program/ProgramCueRow.tsx` | Expandable cue row with CueFxTable, count badges |
| `src/components/runner/program/ProgramMarkerRow.tsx` | Interactive marker with inline rename/delete |
| `src/components/cues/CueForm.tsx` | Cue edit sheet (properties, presets, effects, triggers) |
| `src/components/cues/CueDetailSheet.tsx` | Read-only cue detail sheet (Run view eye-icon) — lighter companion to CueForm for inspecting a cue's composition without risk of accidental edits |
| `src/hooks/useRunnerAnimation.ts` | requestAnimationFrame hook for fade/auto-advance progress |
| `src/hooks/useNarrowContainer.ts` | ResizeObserver hook that returns `true` while a container's width is below a threshold. Used by `RunPage` to switch between desktop and mobile runner layouts. |
| `src/lib/cueUtils.ts` | `buildCueInput()` -- converts a Cue to CueInput for mutations |

#### Navigation
Both views are registered in `src/navigation.ts` with `visibility: "active-only"` and `group: "live"`:
- `program` → `/projects/${p}/program`
- `run` → `/projects/${p}/run`

Legacy routes (`/show`, `/cue-stacks`, `/projects/:id/show`, `/projects/:id/cue-stacks`) redirect to `/run` so bookmarks still resolve.

## Data Model

### ShowDetails
```typescript
interface ShowDetails {
  projectId: number
  activeEntryId: number | null    // Currently playing entry; null = show not running
  entries: ShowEntryDto[]
  canEdit: boolean
}

interface ShowEntryDto {
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

## Program View

The Program view is the show assembly surface. It has two levels:

**Show Overview** (`ShowOverview.tsx`) -- shown when no stack is drilled into:
- Ordered entry list with drag-to-reorder (dnd-kit)
- STACK entries: show cue count, loop/sequential badge, drill chevron, remove button
- MARKER entries: inline-editable label, remove button
- "Add Stack" opens a slide-in stack picker overlay with search filtering
- "Add Marker" appends a new marker entry
- Activation controls live in `ProgramPage`'s page header (see next section), not in ShowOverview

**Stack Detail** (`StackDetail.tsx`) -- shown when drilling into a specific stack:
- Full cue list with drag-to-reorder
- Each row shows cue number, name, fade info, count badges (presets, effects, triggers)
- ProgramCueRow expands on chevron click to show CueFxTable inline
- Click the row itself to open CueForm sheet for full editing
- "+ Add Cue" creates a blank cue and opens CueForm
- "+ Add Separator" creates a MARKER cue
- "Stacks" back button returns to show overview

### Page header

`ProgramPage` renders a breadcrumb (`Projects > Project > Program`, plus the drilled stack name when one is open) and one of:

- **Start Show button** when the show isn't running. Disabled when the show has no STACK entries. Clicking activates the show and then navigates to `/projects/:id/run` so the operator lands on the runner. The activate mutation patches the `projectShow` cache as soon as the server responds (`onQueryStarted` in `store/show.ts`), so Run mounts already seeing `isShowActive: true` and the Start CTA hero never flashes during the transition.
- **Go to Run button** when the show is active. Clicking jumps to `/projects/:id/run`. Symmetric placement to Start Show — same visual weight in the same slot — so re-finding the runner from Program is a single deliberate click.

Stopping the show happens from Run, not here.

### Auto-drill and deep links

`ProgramPage` mounts with one of three drill states:

1. **`?stack=<id>&cue=<id>` query params present** — drill into that stack and open `CueForm` for that cue. Used by Run's "Edit Cue" header button so the operator can detour into editing the live cue without manually navigating. The params are stripped from the URL after the first read so a refresh doesn't re-open the sheet.
2. **Show is running, no params** — drill into the active stack on first mount. The operator lands where the action is. Tracked via `initialDrillDoneRef` so the drill fires once per mount; clicking "Stacks" or the breadcrumb afterwards reverts to Show Overview without us re-drilling them.
3. **Show is stopped, no params** — start at Show Overview. Standard pre-show prep flow.

### Sync with runner state

The Program view mirrors the runner so the operator can edit during a tech run at a glance:

- **"Live" badge on the active stack** in Show Overview — a green pill with a pulsing dot, plus a green left border accent and green-toned name. Makes the running stack instantly findable.
- **Active-cue marker** in StackDetail — the live cue's row gets a green left-border accent, the drag-handle is replaced with the green `Play` glyph, and the name turns green-bold. Only the cue currently on stage in the *active* stack is marked; other stacks show no marker even when drilled into. Program intentionally does **not** show the standby/next marker — the operator is focused on editing here, not on playback sequencing.
- **Active state derivation.** No new server fields. `ProgramPage` derives `activeStackId` from `show.activeEntryId` (read via `useProjectShowQuery`). The active-cue marker is gated on `drillStackId === activeStackId` so it never lights up on a non-running stack.

## Run View

The Run view is the production playback surface. When the show isn't running, `RunPage` renders a centred Start CTA hero — a "Show is not running" heading, brief sub-copy, and a `size="lg"` Start Show button. If the show has no STACK entries, the CTA is replaced with a link to Program so the operator can add one.

When the show is running, the header carries:

- An **Edit Cue** button that navigates to `/projects/:id/program?stack=<activeStackId>&cue=<activeCueId>`. ProgramPage drills into the active stack and opens `CueForm` for the live cue (see "Auto-drill and deep links" above). Disabled when no stack is selected.
- A green-dot indicator + **Stop** button. Stop opens a confirmation Dialog ("Stop the show?") to guard against accidental clicks during a live performance — accidental cancellation of cue state mid-show is more disruptive than the extra click costs. Confirm fires `/deactivate`; the page stays on `/run` and flips to the Start CTA. The deactivate mutation, like activate, patches the `projectShow` cache on success so the transition is flicker-free.

Below the header, the runner body. Layout from top to bottom:

### ShowBar
Top control surface with:
- **DBO** (Dead Blackout) toggle
- **BPM display** + **TAP** button for tempo
- **Cue info**: active cue name (green), standby cue (blue), next stack hint
- **Keyboard hints**: `<- back`, `space: go`
- **BACK** button
- **GO** button (large, green)

### Show Entry Strip
Horizontal tab bar mapping `show.entries`:
- STACK entries render as clickable tabs (active state from `activeEntryId`)
- MARKER entries render as non-interactive dividers (vertical lines + label)
- Loop indicator icon on looping stacks
- Theatre/Band context toggle on the right

### Cue List
Scrollable list of cues in the active stack:
- Status icons: play (active/green), circle (standby/blue), check (done/greyed)
- **Click-to-requeue**: clicking a non-active cue dispatches `setStandby`, making it the next target for GO. The standby moves immediately; no backend call until the next GO fires.
- **Click active cue**: opens the read-only CueDetailSheet (since re-queuing the active cue is a no-op)
- **Eye icon**: every row has an eye button that opens `CueDetailSheet` — a read-only view of the cue's composition (palette, presets, effects, triggers, timing). The sheet has an Edit button that deep-links into Program's CueForm.
- Fade progress bar (green) on active cue
- Auto-advance countdown bar (blue) on active cue

### Theatre vs Band Mode
A per-stack toggle on the entry strip controls the display density:
- **Theatre**: shows Q number column, notes column, detailed fade info -- designed for scripted shows with numbered cues
- **Band**: minimal display, hides Q numbers and notes -- designed for live performance where cue names and effect counts are sufficient

### Mobile Remote Control

When the Run view's container width drops below **600 px**, the runner swaps from the desktop ShowBar + cue-list layout to a dedicated remote-control surface (`ShowRunnerMobile`). The switch is **container-width based, not viewport-based** — side panels opened on desktop (effects overview, AI chat, cue slot overview) that squeeze the runner below the threshold also flip the view. The `useNarrowContainer` hook observes the runner container and `RunPage` conditionally renders the mobile or desktop subtree; only one tree is mounted at a time.

**Layout (top → bottom):**

- **Top strip** (`h-12`): stack-name button (opens `StackPickerSheet`) · cue-list icon (opens `MobileCueListSheet`) · spacer · BPM value + TAP · DBO toggle · Theatre/Band pill (`T`/`B`). The T/B toggle is preserved on mobile so operators retain the same context control they have on desktop.
- **Active-cue hero** (`flex-1`): centred Q number (theatre only) + cue name (green, large) + fade-progress bar + fade info badge + auto-advance countdown bar + optional notes.
- **Standby card**: Q + name in blue when a standby cue exists, "→ NextStackName" (with arrow) at a stack boundary, "End of show" when neither is available.
- **GO/BACK footer**: `grid grid-cols-[1fr_2fr]`, `h-14` buttons. Padding uses `calc(0.75rem + env(safe-area-inset-bottom, 0px))` so the GO button clears the iOS home indicator. The label changes to "END" (disabled) when both standby and next-stack are null.

**Hero states** — the `activeCueId` transient clears on `markDone` (e.g. SNAP fades), so the hero has three states:

1. `activeCue` set → name + Q + fade progress + auto countdown.
2. `activeCue` null, `standbyCue` set → "Ready — Press GO to fire" placeholder.
3. Both null → "Idle — End of stack".

**Bottom sheets** use `Sheet side="bottom"` from `src/components/ui/sheet.tsx`. Both are controlled (stay mounted) so scroll position survives reopen. `MobileCueListSheet` caps at `max-h-[70dvh]` with its own overflow.

**Cue edit transition** — tapping a cue in `MobileCueListSheet` closes the sheet, then calls `openCueForm` on a 320 ms timeout (matching the Sheet's 300 ms close animation). This avoids two Dialogs trapping focus simultaneously.

**Keyboard listener** stays registered unconditionally so tablets with Bluetooth keyboards still respond to Space/ArrowLeft regardless of container width.

**Prerequisite**: `viewport-fit=cover` is set in `index.html` so `env(safe-area-inset-bottom)` resolves correctly on iOS; without it the footer would not clear the home indicator.

**Not migrated to mobile**: the OOO (out-of-order) banner, the 7-column cue list (use `MobileCueListSheet` instead), the horizontal show entry strip (use `StackPickerSheet`). The Program view has no mobile treatment yet — editing flows remain desktop-first.

## Playback Flow

### GO Command
Keyboard: `Space` | Button: `GO`

1. **Normal GO** (standbyCueId exists):
   - Redux: `go()` -- moves standby to active, computes next standby
   - Backend: `POST /cue-stacks/{id}/activate` (first GO) or `POST /cue-stacks/{id}/go-to` with the explicit standby cue id (subsequent). Using `go-to` instead of `advance` ensures that a cue re-queued via click-to-requeue fires correctly — the backend jumps to that exact cue rather than computing "next" itself.
   - Animation starts fade progress from 0

2. **Boundary GO** (standbyCueId is null, end of stack):
   - ShowBar shows `-> {nextStackName}` hint in blue
   - Redux: cancels animations, sets `activeEntryId` to next STACK entry
   - Backend: `POST /project/{id}/show/advance` (direction: FORWARD)
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
2. Calls `POST /project/{id}/show/go-to` with target entry ID
3. Runner state resets: standby = first cue, completed = empty

## Show Activation

### Lifecycle
1. **Show not active** (`show.activeEntryId == null`):
   - Program header shows a Start Show button (disabled when no stacks), body shows the editable overview / drill-in detail.
   - Run header shows only the breadcrumb; body shows the Start CTA hero.
   - Clicking Start from either surface calls `POST /project/:id/show/activate`. From Program we additionally navigate to `/run` on success so the operator lands on the runner. From Run we stay on `/run` — the body flips from the CTA to the runner.
2. **Show active**:
   - Program header shows a "Go to Run" button (green dot + arrow). Auto-drills into the active stack on mount so editing detours land where the live cue is.
   - Run header shows the Edit Cue button + green dot + Stop. Body is the runner.
3. **Stop / Deactivate**: clicking Stop on Run opens a "Stop the show?" confirmation Dialog. On confirm, backend `/deactivate` runs; the server clears `activeEntryId` and broadcasts; the show data refetch updates `isShowActive`. The Run body flips back to the Start CTA hero; the user stays on `/run` and can re-start with one click.
4. **Activate details**: backend short-circuits if already active (no cue stack reset on repeat activates). On first activate, picks the first STACK entry and starts its cue stack at the first STANDARD cue.

### No-flicker activate / deactivate
Both `activateShow` and `deactivateShow` mutations use `onQueryStarted` to patch `projectShow` cache (`activeEntryId`) the moment the server responds, before the `invalidatesTags`-triggered refetch completes. This means:
- Start on Program → navigate to `/run` → RunPage mounts already seeing `isShowActive: true`. The Start CTA never flashes.
- Stop on Run → body flips to the Start CTA without a transient re-render of the runner with stale state.

### Initial Load Sync
The backend is the source of truth. On mount each page fetches the show via `useProjectShowQuery(projectId)`; `isShowActive = show.activeEntryId != null`. A reload on `/run` lands the user on the same `activeEntryId` as before (entry persisted server-side). A reload on `/program` preserves drill state only as component-local state — reloading re-opens the Show Overview, which is fine since drilling is a one-click action.

## REST API Endpoints

### Show
```
GET    /project/{id}/show                       Get show state (entries + activeEntryId)

POST   /project/{id}/show/add-stack             Add stack entry
POST   /project/{id}/show/add-marker            Add marker entry
PUT    /project/{id}/show/entries/{eid}         Update entry label/order
DELETE /project/{id}/show/entries/{eid}         Remove entry
POST   /project/{id}/show/reorder               Reorder entries

POST   /project/{id}/show/activate              Start show playback
POST   /project/{id}/show/deactivate            Stop show playback
POST   /project/{id}/show/advance               GO to next/prev stack entry
POST   /project/{id}/show/go-to                 Jump to specific entry
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
| `showEntriesChanged` | (none) | Invalidates `ShowEntries` RTK Query tag. Fired on entry CRUD operations (add, remove, reorder, update). |
| `showChanged` | `projectId`, `activeEntryId`, `activatedStackId`, `activatedStackName` | Fired on any change to `activeEntryId` — activate, deactivate, advance, go-to. When deactivating, entry/stack fields are `null`. |
| `cueStackListChanged` | (none) | Invalidates `CueStackList` RTK Query tag |
| `cueListChanged` | (none) | Invalidates `CueList` RTK Query tag |

### Subscription Pattern
Each WS API module exposes subscribe methods returning a `{ unsubscribe }` handle. The store layer subscribes globally to invalidate RTK Query tags (e.g. `show.subscribeToEntriesChanged` → invalidate `ShowEntries`). Components subscribe locally for real-time state updates (e.g., `RunPage` subscribes to `show.subscribeToChanged` to track `activeEntryId`).

## State Management

### RTK Query Cache
All CRUD operations go through RTK Query with tag-based cache invalidation:
- `ShowEntries` -- invalidated by any show mutation or WS `showEntriesChanged`
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
- `setStandby`: re-queues a specific cue as the next GO target (click-to-requeue). Purely local — the backend is told on the next GO via `goToCueInStack`. Clears the cue from `completedCueIds` so the "done" tick doesn't linger.
- `resetStack`: initializes runner for a stack, optionally restoring from server `activeCueId`
- `markDone`: marks fade complete, clears active
- `reconcileActiveCue`: syncs with server-reported active cue if it differs from local state

### Effective Active Cue (`effectiveActiveCueId`)

SNAP cues (no fade) complete in a single frame: `go` sets `runner.activeCueId`, then `markDone` immediately clears it. The server's `stack.activeCueId` still points to the cue on stage. `RunPage` therefore derives:

```typescript
const effectiveActiveCueId = runner.activeCueId ?? stack?.activeCueId ?? null
```

This composite id drives the green active highlight in the cue list, the ShowBar's active-cue label, and click-to-requeue's "already active" guard. During a fade `runner.activeCueId` is authoritative (it drives progress bars); after `markDone` the server-tracked value takes over so the cue stays visibly active. Program view uses `activeStack.activeCueId` directly since it never runs fades.

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Project IS the show (no ShowSession layer) | The 1:N relationship between project and sessions added complexity without practical value — operators treat a project as a show. Entries live directly on the project. |
| Split Program and Run into separate routes | Each surface has a different primary action (Start vs GO). Collapsing them under a single `/show?mode=` route made the running/stopped state hard to read and buried the Start button. Separate sidebar entries make the split obvious and let each view own its own header. |
| Start on Program and on Run; Stop on Run only | You can kick off from either surface — Program's Start navigates to Run post-activate; Run shows a big Start CTA when inactive so re-starting after a Stop is one click. Stop belongs with the live controls on Run. |
| Breadcrumb shows drilled stack on Program but not Run | Program's drill state isn't otherwise visible above the StackDetail header — the breadcrumb segment makes it scannable and clickable. Run is always at one stack and the strip / picker already names it, so a breadcrumb segment would just duplicate. |
| Confirmation Dialog on Stop, immediate Start | Stopping mid-show is destructive (clears active cue, breaks the live performance) — worth a click to guard against fat-finger. Starting is recoverable (Stop is one click away on the same view), so no confirmation. |
| Edit Cue deep-link from Run | An operator who notices a problem with the live cue should be one click from editing it, not asked to navigate via Program → drill into the active stack → click the cue. Query params (`?stack=&cue=`) keep the link stateless and shareable, then strip on first read. |
| Auto-drill on Program mount when running | Brings back the tech-run ergonomic from the old mode-toggle world without coupling to any URL state — `initialDrillDoneRef` ensures it fires once per mount so the operator can still escape to Show Overview without being snapped back. |
| Optimistic patch on activate / deactivate via `onQueryStarted` | `invalidatesTags` triggers a refetch but doesn't update the cache until the refetch completes, leaving a brief window where the page could render the wrong state (e.g. Start CTA after Start click). Patching `activeEntryId` directly on success closes that window. |
| Show-driven stack strip (not all-stacks) | Run only displays stacks in the show, in order, with marker dividers |
| Right-side Sheet for cue editing | Matches existing Sheet pattern used throughout the app |
| Expandable rows in Program view | Allows the Program view to eventually replace the FX Cues view |
| BACK never crosses stack boundaries | Intentional safety constraint -- only GO advances between stacks |
| Show "active" = `activeEntryId != null` | Single source of truth on the project; no separate `isActive` flag to keep in sync |
| `stackMap` for O(1) lookups | UseMemo'd `Map<number, CueStack>` avoids repeated `.find()` in entry strip and show overview |
| Container-width switch to remote-control view | Responds to the runner's actual available space, not just viewport — side panels on desktop can also trigger the compact layout. Single-tree mount via `useNarrowContainer` rather than CSS `@container` hide/show keeps the DOM lean. |
| Green = active, blue = standby (not amber/green) | Green reads as "on / go" and has higher contrast against the dark runner background than amber. Blue for standby (next) avoids confusion with the "show is running" green dot in the header — the standby colour is a cooler tone that implies "queued, not yet firing". |
| Click-to-requeue in Run view (not Program) | Run is the playback surface; the operator's main action is controlling cue order. Program is for editing — a click-to-edit there (opening CueForm) is more valuable than re-queueing. In Run, the eye icon provides the detail-view affordance so the row click is freed for re-queue. |
| `goToCueInStack` instead of `advance` on GO | `advance` asks the backend to compute the next cue, which doesn't account for a frontend re-queue. `goToCueInStack` sends the explicit standby cue id, keeping the backend and frontend in sync after a re-queue. |
| `CueDetailSheet` read-only view | A lighter alternative to opening the full CueForm in Run view. Operators want to inspect cue composition (presets, effects, triggers) at a glance without the risk or overhead of the edit form. The sheet has an Edit button that deep-links to Program's CueForm if the operator decides to make changes. |

## Known Gaps

1. **No script quick-fire panel** -- no way to fire scripts ad-hoc during a show without attaching them to a cue trigger.
2. **Boundary GO end-to-end** -- `advanceShow` has only been tested locally; needs full lifecycle verification with the backend.
3. **Program view on narrow viewports** -- Show Overview and Stack Detail still use the desktop layout on phone-sized containers; phone-first authoring is a separate effort.
