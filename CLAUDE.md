# Claude Code Configuration

## Project Overview

This is the React frontend for the DMX lighting controller system. The backend is located at `/Users/chris/Development/Personal/lighting7` (Kotlin/JVM).

## Git workflow

Solo personal repo — commit and push directly to `main`. Do **not** open pull
requests, do **not** create feature branches. The standard "still don't commit
or push without me asking" rule from the global CLAUDE.md still applies; this
section only changes *how* a confirmed commit/push happens (straight to `main`,
no PR).

### Pre-commit gate

```bash
npm run check
```

That's `build` + `test` + `lint`. There's no separate `type-check` step in it:
`build` is `tsc && vite build`, so the standalone `npm run type-check` would run
the same full `tsc` a second time for ~9s of nothing. Use `type-check` on its
own during development when you want types without a build.

Lint is a real gate now. The tree is at 0 errors and 0 warnings, so any finding
ESLint reports is one this change introduced. Fix it rather than committing
over it. `npm run lint` passes `--max-warnings 0`, because plain `eslint` exits
0 on warnings and would wave them through.

**A git hook enforces this.** `.githooks/pre-commit` runs `npm run check` and
refuses the commit if it fails; it skips the run when nothing buildable is
staged (docs, `.idea/`, assets). Enable it in a fresh clone with
`git config core.hooksPath .githooks`. Bypass a single commit with
`git commit --no-verify`. It checks the working tree rather than the staged
snapshot — see the comment at the top of the hook for why.

Warnings count. `react-hooks/exhaustive-deps` in particular is left at `warn`
because the right answer is case-by-case, not because it can be ignored —
adding a dependency changes when an effect re-runs, so decide deliberately:

- **Add the dep** when the hook genuinely reads a value that can change.
- **Narrow the input** when only part of an object matters — destructure the
  fields the hook actually uses and depend on those (see `useSliderValue` in
  `src/hooks/usePropertyValues.ts`).
- **Memoise the input** when a `?? []` fallback hands out a fresh identity
  every render (see `serverPalette` in `components/busking/PalettePanel.tsx`).
- **Disable with a reason** only when the narrow deps are provably complete —
  say *why* they're complete, naming the callee whose fields you checked (see
  `rigEuler` in `components/stage3d/Stage3D.tsx`).

A bare `eslint-disable` with no justification is not an acceptable fix.

## Tech Stack

- **React 19** with TypeScript
- **Vite** for bundling and development
- **Radix UI primitives + Tailwind** for UI components (via `src/components/ui/`)
- **Redux Toolkit** with RTK Query for state management and API calls
- **React Router v8** for routing — note there is no `react-router-dom` package in
  v8: import hooks and components from `react-router`, and `RouterProvider` from
  `react-router/dom`.
- **WebSockets** for real-time backend communication

### The `engines.node` range

`^22.22.2 || ^24.15.0 || >=26.0.0` is the intersection of what the dependency
set actually supports, not a tidy floor. **Don't "simplify" it to `>=22.22.2`
or `>=24.15.0`** — both are wrong:

- React Router 8 sets the hard floor at `>=22.22.0`.
- jsdom 30 accepts `^22.22.2 || ^24.15.0 || >=26.0.0` — it skips the
  odd-numbered 25 line entirely, and 24.0–24.14 with it. That's what carves
  the range into three clauses.

Recompute it when a dependency bumps its own `engines`; `npm install` warns
(`EBADENGINE`) rather than failing, so a wrong range is easy to miss.

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
npm test             # Run Vitest test suite
npm run test:watch   # Run Vitest in watch mode
```

### Development Server

The Vite dev server proxies API requests:
- `/api/*` -> `http://localhost:8413/api/`
- `/script-editor/*` -> `http://localhost:8413/script-editor/`

WebSocket URL is automatically derived from the current host or can be overridden with `VITE_SOCKET_URL`.

## Key Features

### Scripts

Kotlin scripts for lighting automation. Editing uses the embedded `kotlin-playground`
widget (`src/kotlinScript/`), whose highlighting and autocomplete are served by **lighting7
itself**, from the same embedded Kotlin compiler that runs the scripts —
`/script-editor/*`, backed by `routes/scriptEditor.kt` + `scripts/ScriptEditorService.kt`.
There used to be a bundled `kotlin-compiler-server` fork behind `/kotlin-compiler-server`,
in a second JVM on port 8321; it is gone.

Two things to keep in step with the backend:

- **`wrapForEditor` in `components/scripts/ScriptEditor.tsx`** hands the widget the
  `//@lighting7-script-type=<TYPE>` marker, then the body between `//sampleStart` and
  `//sampleEnd`, and nothing else. Both halves are load-bearing, for different consumers, and
  neither is presentation:
  - The **fold markers are the widget's**. They fold the editor down to the body, make
    `onChange` hand back only the body, and offset every position it reports or asks about.
    The widget then *strips* them and posts `prefix + editorContents + suffix`, so the
    backend never sees them and `EditorDocument` always takes its no-marker path.
  - The **type marker is the backend's** — how it picks the template. Drop it and that editor
    silently falls back to GENERAL, losing every FX symbol. It cannot move into a query
    param or a per-type base URL: the widget owns the request shape, and its `server` is a
    module-level global that every `playground()` call overwrites, so two editors of
    different types would poison each other.

  There used to be a synthetic base class and import list per type here. Because the widget
  sends everything outside the fold markers verbatim, that stand-in was what the backend
  actually compiled — its constructor signature had to track the real base class by hand.
  With just the marker line, the real `.kts` template is what the body is compiled against.
- **The widget's own Run button is hidden** (`.kotlin-editor .run-button` in `index.css`).
  Every surface supplies its own Run wired to `/{projectId}/scripts/run`, which runs against
  the live show; the widget's button was a second, less correct path to the same thing.

### Scenes & Chases
- **Scenes**: One-shot lighting configurations that run a script with specific settings
- **Chases**: Animated lighting sequences (same component, different mode)

Both use scripts as their base and allow configuring script settings per scene/chase.

### Fixtures
DMX fixture definitions - describes what channels a fixture uses and how to control it.

### Channels
Raw DMX channel control per universe. Shows all 512 channels with current values.

### Stage views

Three surfaces render live fixture state: the 3D canvas, the 2D Plan/Front/Side plot, and the
`StageOverviewPanel` mini-stage. All three read through a **`ChannelSource`** rather than
`lightingApi.channels` directly, so the operator can point them at Output / Output + Programmer /
Programmer only — which is what makes Blind previewable. Colour and intensity come from one shared
colour-source dispatch (`components/fixtures/fixtureAppearance.tsx`); the 3D path keeps a separate
imperative copy on purpose.

See [`docs/stage-vis-engineering.md`](docs/stage-vis-engineering.md). Read it before touching a
stage read path, adding a source, or relying on what `ProgrammerState.channels` means — that field
is the backend's channel *sideband*, not the programmer's channel output, and mistaking the two is
the bug that doc exists to prevent.

### Looks and layers

One library entity — a **Look** — replacing what used to be two (FX presets and named
palettes), and one reference mechanism: a **Layer** applies a Look inside a cue at a
declared position in that cue's stack. Backend contract in
`lighting7/docs/lighting-composition-model.md` §"Looks and layers"; the migration plan and
its remaining sessions are `lighting7/docs/plans/looks-and-layers-plan.md`.

A Look's rows are either **bound** (naming their own fixture or group) or **deferred**
(taking their targets from the layer applying them), and that distinction is what makes one
entity serve both old jobs: a bound Look behaves like a palette, a fully-deferred one like a
preset. `LookSummary.hasDeferredRows` tells them apart, and it decides which editor a
library row opens — a template gets `LookEditor`'s value grid against a synthetic fixture
built from `editorFixtureType`, a recorded Look gets `LookDetailSheet`, which is read-only
about values on purpose. Read that sheet's doc comment before adding a value grid to it.

There is **no stored attribute type**. `LookSummary.families` is derived server-side from the
rows, so a Look spanning colour and position reports both — which is why `/looks` is **one
route with a sticky in-page family filter** rather than four sibling routes like the palette
banks it replaces. That is a deliberate departure from the sibling-route rule in §Navigation
Registry: a derived family cannot own a path. `?family=colour` deep-links from Cmd+K.

`src/lib/attributeFamily.ts` owns the family vocabulary and mirrors the backend's
`PropertyMaskGroup`; `maskPicker.test.ts` pins the two lists against each other.

**Within a cue, later layers win — for every attribute, intensity included**, and the cue's
own `propertyAssignments` are the last layer and beat all of them. Across cues, HTP still
governs intensity. That flip is the change an operator coming from presets is most likely to
be surprised by, so `LayersPane` says it in the section body rather than leaving it implied.
A layer's `sortOrder` is authoritative, not its array position — `reorderCueLayers` in
`lib/cueUtils.ts` renumbers the whole list on every drag for that reason.

`buildCueInput` rebuilds `layers` **field by field**, and its comment says why. A field
missing from that rebuild is dropped on every inline cue edit; `cueUtils.test.ts` pins all
thirteen individually rather than by deep-equal.

**The `ref:{uuid}` value grammar still resolves** (a uuid, not the int id: int primary keys
never appear in the backend's sync export and are re-minted on import, so `ref:12` would
dangle after any import or clone — use `id` for REST paths and layer `lookId`s, `uuid` only
inside a value). But **nothing authors one any more**: a layer with a `propertyMask` is what
replaces it, and session 3 retires the grammar. `LookRefBadge` renders the rows that already
hold one, name-only — no swatch and no family colour, because a Look has no type to colour
by. **Never mint a `P<n>` short code for a Look**; display its name.

"Palette" now means exactly one thing in this codebase: the positional ordered colour list
that FX parameters index as `P1`/`P2`/`P*`, whose helpers are `isPaletteRef` /
`parsePaletteIndex` in `components/fx/colourUtils.ts`. It is still labelled "Colour List" in
the UI; dropping that qualifier is a session-4 tidy-up.

Two things are **not** available yet, both waiting on session 3's programmer rewrite, and
both stated in the UI rather than left to be discovered:

- **Creating a bound Look.** It needs the server-side record, which still writes the retired
  palette tables. The library's Recorded section says so.
- **Update-back after Include.** Include-a-Look stages its literals so they can be seen and
  busked from, and is deliberately one-way — `includedTargetIsReadOnly` is what the
  programmer gates Update on, rather than letting the write-back path put rows into tables no
  consumer reads. Per-cue and per-preset **Make Hard** are gone with their routes; the
  programmer-wide one survives, because references still exist on migrated cues.

### Speed Masters

Named tempo buses. Effects subscribe to one by uuid rather than owning a speed, so
retuning a master moves every look that follows it. **Master 1 is the global tempo**:
every legacy surface means it, every unassigned effect resolves to it, and it cannot
be deleted.

Two different BPMs live on a master and the UI must not conflate them. The **stored**
bpm (`useSpeedMasterListQuery`) is what it boots at; the **live** bpm
(`useSpeedMasterLiveQuery`, streamed over `speedMasters.*`) is what it is running at
now. Rows show the live one and edit it with tap / click-to-type; the stored default is
editable only in the detail sheet, where it can be labelled as such.

`/projects/:id/speed-masters` manages the bank — one nav entry, one route, no sibling
switcher. `SpeedMastersStrip` in the ShowBar is the performance surface and shows
masters **2..N** only, because the ShowBar's BPM tile already *is* master 1.

Two independent per-effect references, both uuid-addressed:

- `speedMasterUuid` — which tempo an effect's beats come from. BEAT effects only.
- `rateSpeedMasterUuid` — scales a **WALL_CLOCK** effect's cycle (`bpm / 120`). Beat
  effects never read it.

`EffectParameterForm` gates on the library entry's `timingSource`: a wall-clock effect
gets "Cycle length (seconds)" and the rate picker, a beat effect gets beat divisions and
the speed picker. Showing both to both was the pre-existing bug — a wall-clock effect's
"Speed Master" did nothing at all.

`BeatIndicator` takes an optional master and pulses from the keyed `speedMasters.beat`
stream; without one it uses the legacy unkeyed `beatSync`, which is bound to master 1's
clock object and cannot speak for any other master. Server frames are throttled (one per
16 beats), so the component free-runs a local timer in between — that interpolation is
load-bearing, not decoration.

### Desk accounts

Login, roles, and user administration for a desk whose accounts live on the
**machine**, not in a project — see
`lighting7/docs/desk-accounts.md` for the backend contract and the break-glass
recovery. Frontend shape:

- `AuthGate` (wrapping `BootGate` in `App.tsx`) decides between `SetupScreen`,
  `LoginScreen`, and the app from `GET /auth/status`. A 401 from **any** endpoint
  invalidates the `Auth` tag, which is the entire logout mechanism; a WS close with
  code **4401** does the same, because the backend revokes live sockets.
- `store/users.ts` is admin-only CRUD (`/api/rest/users`); `store/passwordReset.ts`
  and `store/deviceLogin.ts` are the **public** endpoint pairs the two phone pages
  use. They are separate slices because they are separate audiences —
  cookie-authenticated admin vs. no session at all — not merely separate paths. The
  *desk* side of the device-login QR lives in `store/auth.ts`, because it is
  authenticated and open to any role.
- `routes/ResetPasswordPage.tsx` and `routes/DeviceLoginPage.tsx` are **siblings of
  `Layout`**, not children, and are bypassed past both gates via the `publicPath`
  flag computed at module scope in `App.tsx`: no sidebar, no ShowBar, no project
  context, no session. Whoever opens `/reset/<token>` is by definition locked out;
  whoever opens `/device/<token>` has no session yet either.

  Two traps there. It matches the **routes**, not a bare prefix — `/device/` with no
  token would otherwise render blank with both gates off. And because the flag is
  read once per document, `DeviceLoginPage` finishes with
  `window.location.assign('/')`: a react-router `navigate('/')` from either page
  would render the whole app with no auth check and no boot check. A test pins that.
- `MIN_PASSWORD_LENGTH` lives in `lib/passwordPolicy.ts` and mirrors the backend's
  floor. Five surfaces ask for a password; a form that disagreed with the server
  would read as a bug in that form. `MAX_DISPLAY_NAME_LENGTH` in `lib/userPolicy.ts`
  mirrors the column width the same way, but makes the **weaker** claim: only
  `ProfileSheet` gates on it today, and `SetupScreen` / `CreateUserSheet` /
  `UserDetailSheet` still rely on the server's 400. Don't read it as "every
  display-name field is bounded".
- **`ProfileSheet` is the only self-service surface**, reached from the user menu,
  which holds nothing else but Log out. Four tabs — **Profile / Password / Devices /
  Sign-in** — and **each tab owns its own action button**; the footer is just Close,
  because a footer Save would have to mean "save the display name" while you were
  looking at the devices list. Errors are per-tab state for the same reason: one
  shared alert would follow you to another tab and blame the wrong form.
  The name and the password are **separate saves and must stay that way**: the
  password submit needs `currentPassword` and a rename must not, and the two differ in
  consequence (a password change revokes every other session; a rename revokes
  nothing). Its route, `PUT /auth/profile`, is authenticated but **any role** and
  deliberately outside the admin-only `/api/rest/users` subtree — a self-exception
  inside a prefix-matched admin gate would mean that prefix list no longer describes
  its own subtree.
- **Account changes self-heal across clients**, via two frames from one backend flow rather
  than the show-scoped `FixturesChangeListener` bus every other list rides (users belong to the
  machine; see `lighting7/docs/desk-accounts.md` → "Account edits reach other clients").
  `usersWsApi` → `store/users.ts` invalidates `UserList` / `User` on every socket;
  `authWsApi.subscribeOwnAccountChanged` → `store/auth.ts` invalidates `Auth` on **only** the
  affected user's sockets. Keep those two apart: folding the `Auth` invalidation into the
  user-list bridge would make every connected client re-read `auth/status` on any admin edit.
  The own-account subscriber lives on `authWsApi` for the same reason the 4401 one does — `Auth`
  is that module's tag.

  One reliance worth knowing before you add a call site: the backend does **not** role-filter
  `userListChanged`, which is safe only because `UsersTab` is the sole caller of
  `useUsersQuery` and passes `skip: !isAdmin`, so an operator has no subscriber and the dispatch
  is a no-op. A second unguarded call site would make every operator socket a 403 generator on
  every user edit. `store/installs.ts` has the same bridge shape for the install row.
- **"Manage users" is deliberately not in the user menu.** The `users` nav entry is
  `adminOnly`, so the sidebar and Cmd+K already carry that page; a second entry point
  only meant role-filtering the same destination in two places.
- 409 responses carrying `LAST_ADMIN` / `SELF_TARGET` are **ordinary flow steps**
  (you can't demote the last admin, and on your own account you can't disable,
  delete, re-role, or mint a reset QR), rendered inline in `UserDetailSheet` — which
  is why those endpoints are in `SILENT_ENDPOINTS`. The self cases are hidden rather
  than disabled in that sheet: a Password section made of three greyed-out controls
  reads as breakage.
- **The two QR surfaces make opposite calls on the way out, on purpose.**
  `ResetQrSheet` leaves its link alive and `ResetTokenHistory` makes it visible and
  revocable; `DeviceLoginSection` cancels its code, because that code *is* a way into
  the account rather than a way to re-password it. Don't factor them together — and
  don't turn the section back into a sheet, either: being the body of `ProfileSheet`'s
  Sign-in tab is what makes "left the tab", "parent closed" and "tree unmounted" one
  cancel mechanism (the teardown effect, keyed on `active` *and* firing on unmount —
  both are needed).
- **The Sign-in tab has no button: arriving mints, leaving cancels.** Radix mounts a
  tab's content only while it is active, and mounting is what mints — so navigating to
  a tab named for the thing replaces a press with a navigation, and the tab bar above
  the code is the way out. What must not regress is the other half: opening the sheet
  lands on **Profile**, so nothing is minted by opening it, and closing resets `tab` to
  `profile` via an effect on `open` rather than any close handler — because saving a
  name closes the sheet without going through one. Treat that reset as a security
  property, not tidiness.
- **Minting a device-login code must happen exactly once**, which is why the mint
  effect carries `mintedRef` and `onScreen()` reads *two* refs. Both exist because of
  StrictMode's development mount/teardown/remount: a flag only cleared in a teardown
  is left false while the section is on screen (every code then cancels itself on
  arrival), and a second POST is not merely wasteful — `AuthService.createDeviceLogin`
  retires the caller's previous code, so two mints race and resolving them backwards
  displays a QR the server has already cancelled. **The client cannot repair that
  afterwards**; it has no way to know which mint the server saw last, so don't reach
  for a "cancel the displaced code" fix. Two tests in `DeviceLoginSection.test.tsx`
  render under `StrictMode` for exactly this — plain `render` passes while all of it is
  broken. `mintedRef` is released again if the mint *fails*, so the "Try again" button
  is reachable: a failed mint leaves no `code`, so the EXPIRED/CANCELLED retry branch
  can't render and the tab would otherwise be an error with nothing to press.

### Cues, Stacks & Triggers
Cues bundle an ordered stack of **Look layers** (see §Looks and layers), their own property assignments, ad-hoc effects, and **script hooks** into named snapshots. **Every cue belongs to a cue stack** — there are no standalone cues. A project owns an *ordered* list of stacks (the "show"); a stack owns an ordered list of cues. A stack row can also be a **SEPARATOR** (a label-only divider between stacks). Cues and stacks are authored and run entirely in the **Program** view (`/projects/:projectId/program`, drilling into a stack at `/program/stacks/:stackId?cue=:cueId`) — the old separate "FX Cues" view has been removed.

**Cue numbers** are free-form display labels (`sortOrder` is the authoritative playback order). They are parsed as **prefix + decimal run + suffix** (`S1-3.1` → `("S1-", [3,1], "")`) and only ever compared *within a prefix group*, so `Pre-show 1, Pre-show 2, T2-1, S-1, S-2` is correctly ordered. `src/lib/cueNumber.ts` holds that model and drives the "Fix Order" banner; it mirrors `routes/cueNumbering.kt` in lighting7, which performs the fix — **keep the two in step**.

A cue without an explicit number gets one derived from its position (`cueNumberAuto: true`), recomputed by the backend whenever the stack changes. Auto numbers render dimmed via `AUTO_CUE_NUMBER_CLASS`; clearing the `Cue #` field returns a cue to auto.

**Timed effects**: Layers and ad-hoc effects can have optional timing (delayMs, intervalMs, randomWindowMs) to fire after a delay or on a recurring interval. Immediate (no timing) is the default. A timed layer re-cooks the whole cue when it fires rather than appending its rows, so an in-flight crossfade weight survives.

**Script hooks** (triggers) automate FX_APPLICATION script execution on cue lifecycle events:
- **ACTIVATION** / **DEACTIVATION** — fire when the cue starts/stops
- **DELAYED** — fire after a configurable delay
- **RECURRING** — fire at an interval with optional randomisation for organic timing

FX definitions have a `timingSource` field (`BEAT` or `WALL_CLOCK`) controlling whether effects sync to BPM or run on a fixed 50Hz wall-clock timer.

### Cloud sync — the GitHub identity

Backend contract in `lighting7/docs/sync-engineering.md`. Three traps on this side:

- **`identity.connected === true` does not mean OAuth works.** A rejected identity keeps
  `connected: true` and gains `reauthRequired` — that conflation is why the desk showed
  "Connected as @user" plus a permanent "refreshing soon" badge for 25 days while every
  sync failed. Every gate must read `connected === true && reauthRequired !== true`; the
  five that do are in `IdentityRow`, `CloudSync.tsx` (×3) and `Projects.tsx`.
- **`/api/rest/oauth/` is admin-gated**, so every caller of `useOauthGithubIdentityQuery`
  passes `skip: !isAdmin` — the same reliance `store/users.ts` documents for
  `useUsersQuery`, and now load-bearing in a new way, because the sidebar badge and the
  global banner mount the query on *every* page rather than only on the sync pages.
  `useOAuthReauthState` bakes the guard in; prefer it to the raw query.
- **`startOAuthIdentityBridge()` is called from `main.tsx`, not on import.** Unlike
  `store/users.ts`, this slice is imported from the earliest render path (the sidebar), so
  touching `lightingApi` in its module body throws a TDZ `ReferenceError` and takes every
  export with it — the sidebar and banner render as "not defined". `tsc`, `vite build` and
  the unit tests all pass anyway, because the cycle exists only at runtime and the tests
  mock the module: it shows up **solely** as a broken app in the browser.

The banner is dismissible against the rejection's timestamp (localStorage), so dismissing
survives reloads but a genuinely new outage still gets seen. It is a banner and not a toast
or modal for the same reason the update panel never nags: an operator mid-show must not be
interrupted — and here they are not shown it at all, since they cannot fix it.

### In-app updates

The **Updates** tab in `InstallSettings` (`components/updates/UpdatePanel.tsx`), backed by
`store/updates.ts` and `api/updateWsApi.ts`. Windows installer builds only; every other build
renders a one-line explanation of why it can't update itself. Backend contract and the MSI
mechanics live in `lighting7/docs/windows-updates.md`.

- **`updateStateChanged` is the one payload-carrying machine-socket frame**, so `updateWsApi` is
  modelled on `cloudSyncWsApi`, not `installWsApi`. For a several-hundred-megabyte download the
  frame *is* the progress; a payload-free "refetch" at 2 Hz would mean an HTTP round-trip per
  tick, which is the traffic the socket exists to avoid.
- The bridge in `store/updates.ts` splits deliberately: **`updateQueryData` for progress ticks**
  (zero network), **`invalidateTags` only on a terminal phase** — that's where `latest`, `error`,
  notes and `lastApplyOutcome` arrive. Invalidating per tick would defeat the whole reason the
  frame carries a payload. The panel also polls at 5 s **while busy** as a safety net, because
  `emitMachineEvent` uses `tryEmit` and drops frames when its buffer fills: a dropped progress
  tick is harmless, a dropped phase transition would strand the panel.
- The tab is visible to **everyone** with actions disabled for operators — the version, and that
  the desk is about to restart, are things anyone standing at it should read. **Never toast or
  modal an available update**: an operator mid-show must not be nagged.
- Release notes render as **plain text**. They are untrusted text fetched from the internet, and
  per §Dependencies a sanitising markdown renderer isn't worth adding for this.
- `ApplyUpdateDialog` requires **type-to-confirm only when the rig is live** (effects running or
  a stack active). The asymmetry is the point: making every routine update a typing chore trains
  people to type without reading, destroying the friction exactly when it matters. It also sends
  `confirmVersion`, so a tab left open across a newer check can't apply something its owner never
  saw — the backend 409s on a mismatch.

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
- Dynamic items (e.g. universes) are handled by the `useUniverseNavItems()` hook (`useNavItems()` just returns the static `navItems`)
- **Exception — cards/list sibling routes**: list views that pair with a cards
  view (`/fixtures/list`, `/groups/list`) deliberately have **no** `navItems`
  entry. They're reached via the in-page Cards/List switcher
  (`src/components/ViewSwitcher.tsx`) and Cmd+K item deep links, and the
  sidebar keeps one entry per resource; the cards route redirects to the list
  when the sticky view preference says so. Follow that pattern for any new
  cards/list pair instead of adding a second sidebar row.
- **Same exception — the programmer's sibling views**: `/programmer` (Values) has
  a `navItems` entry, `/programmer/fx` (FX) deliberately does not. It is reached
  via `ProgrammerViewSwitcher` in `src/components/ViewSwitcher.tsx`. Unlike the
  cards/list pair this switcher is **not** sticky and there is no redirect: the
  FX sheet is a diagnostic read of what is running, so landing there because you
  last looked at it — rather than on the values you came to edit — would be the
  wrong default.
- **Where sibling routes do *not* apply — the Look library.** `/looks` is one
  `navItems` entry and **one route**, with a sticky in-page family filter
  (`LookFamilyFilterBar`) rather than the four sibling routes the palette banks it
  replaces had. Not a style choice: a Look's families are *derived* from its rows,
  so one covering colour and position would have to live in two routes at once.
  `useLookFamilyNavItems()` still gives Cmd+K five deep links, but as `?family=`
  query params on the one route, with `pathMatch` left as the bare `/looks` so the
  sidebar highlights its single row whichever family you arrived in — asserted in
  `navigation.test.ts`. Reach for sibling routes when the sub-views partition the
  resource (cards/list, an editor and its diagnostic); reach for a filter when a
  record can be in more than one bucket.
- **Role filtering**: set `adminOnly: true` on any entry whose destination is
  behind the backend's admin gate (`ADMIN_ONLY_PREFIXES` / the per-project sync
  subtree in lighting7's `auth/AuthGate.kt`) — currently `users`, `sync` and
  `project-sync`. `filterNavItems(items, isViewingActiveProject, isAdmin)` drops
  them for operators so neither the sidebar nor Cmd+K offers a page that can only
  answer 403. `useIsNavAdmin()` supplies the flag and treats *anything but a
  resolved OPERATOR* as admin: during the `auth/status` round-trip, and on a
  bootstrap-open desk, the API really is reachable, and the backend refuses the
  call either way. This is presentation, never permission.
- **Not every nav path is its own route**: `users`' `/install/users` is served by
  `InstallSettings`' `:tab` route, like `sync` and `diagnostics`. Adding a tab
  means touching `TABS` + a `TabsTrigger` in `routes/InstallSettings.tsx`, not
  `App.tsx`.

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
- **Unsaved changes**: a sheet holding a form should call `useUnsavedChanges(isDirty)` from the
  component that owns the form state. Escape, a click outside and the X then ask
  *"Discard changes?"* first. Only a close **Radix** drives reaches that question, so a Cancel
  button must be wrapped in `<SheetClose asChild>` rather than calling the parent's own
  `setOpen(false)` — and must not also carry an `onClick` that closes, since `asChild` would run
  both. It reports up through context, so it works from any depth and is a
  no-op outside a sheet (`CueTriggerEditor` uses the same call in its inline mode). A parent that
  already tracks dirtiness can pass `<Sheet unsavedChanges={...}>` instead; the two combine.
  Only controlled sheets can be guarded — an uncontrolled one closes itself inside Radix.
- **The Kotlin editor's completion popup** is a bare `<ul>` on `<body>`, invisible to Radix's
  layer stack, so `SheetContent` special-cases it twice: Escape while it is open closes the popup
  and not the sheet, and clicking a suggestion doesn't count as clicking outside. Both are in the
  primitive, not in the editor's own sheets, because every sheet that mounts a script editor
  would otherwise need them.

### TypeScript
- Strict mode enabled
- Prefer explicit types over `any`
- Use interface for object shapes

### Dependencies
- Reaching for a well-maintained library is fine — often better — when the
  alternative is rebuilding non-trivial functionality yourself (a testing
  framework, date/time math, virtualization, etc.). Don't reinvent that.
- But don't add a dependency to solve a trivial problem you could write in a few
  lines (the left-pad trap), and weigh the transitive cost — avoid dragging in a
  large or poorly-maintained tree for a small need ([xkcd 2347](https://xkcd.com/2347/)).
- When it's a genuine judgment call, flag the trade-off and get a quick yes
  before adding, rather than silently growing (or silently avoiding) the
  dependency set.

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