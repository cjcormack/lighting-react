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

### Palettes

Named, typed (INTENSITY / POSITION / COLOUR / BEAM) collections of **per-fixture**
property values that cues, FX preset rows and programmer entries reference by
identity rather than by value. The stored value is `ref:{paletteUuid}` — a uuid,
not the int id, because int primary keys never appear in the backend's sync
export and are re-minted on import, so `ref:12` would dangle after any import or
clone. Use `id` for REST paths and `uuid` for anything naming a palette inside a
value; `src/lib/programmerValue.ts` owns that grammar.

Editing a palette republishes every live consumer — one edit moves every look
that references it, which is the point of the feature. There is deliberately **no
per-cell palette editor**: you Record from the programmer, or Include → edit on
stage → Update. **Make Hard** (programmer-wide or per cue) is the escape hatch,
replacing references with the literals they currently resolve to.

Two unrelated things are called "palette" in the lighting world, so this repo
qualifies the older one: the positional ordered colour list that FX parameters
index as `P1`/`P2`/`P*` is labelled **"Colour List"** in the UI. Its helpers
(`isPaletteRef` / `parsePaletteIndex` in `components/fx/colourUtils.ts`) mean that
form; the named-palette ones (`isPaletteRefValue` / `parsePaletteRefUuid`) mean
this one. **Never mint a `P<n>` short code for a named palette** — display its
name.

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
Cues bundle palettes, FX preset applications, ad-hoc effects, and **script hooks** into named snapshots. **Every cue belongs to a cue stack** — there are no standalone cues. A project owns an *ordered* list of stacks (the "show"); a stack owns an ordered list of cues. A stack row can also be a **SEPARATOR** (a label-only divider between stacks). Cues and stacks are authored and run entirely in the **Program** view (`/projects/:projectId/program`, drilling into a stack at `/program/stacks/:stackId?cue=:cueId`) — the old separate "FX Cues" view has been removed.

**Cue numbers** are free-form display labels (`sortOrder` is the authoritative playback order). They are parsed as **prefix + decimal run + suffix** (`S1-3.1` → `("S1-", [3,1], "")`) and only ever compared *within a prefix group*, so `Pre-show 1, Pre-show 2, T2-1, S-1, S-2` is correctly ordered. `src/lib/cueNumber.ts` holds that model and drives the "Fix Order" banner; it mirrors `routes/cueNumbering.kt` in lighting7, which performs the fix — **keep the two in step**.

A cue without an explicit number gets one derived from its position (`cueNumberAuto: true`), recomputed by the backend whenever the stack changes. Auto numbers render dimmed via `AUTO_CUE_NUMBER_CLASS`; clearing the `Cue #` field returns a cue to auto.

**Timed effects**: Preset applications and ad-hoc effects can have optional timing (delayMs, intervalMs, randomWindowMs) to fire after a delay or on a recurring interval. Immediate (no timing) is the default.

**Script hooks** (triggers) automate FX_APPLICATION script execution on cue lifecycle events:
- **ACTIVATION** / **DEACTIVATION** — fire when the cue starts/stops
- **DELAYED** — fire after a configurable delay
- **RECURRING** — fire at an interval with optional randomisation for organic timing

FX definitions have a `timingSource` field (`BEAT` or `WALL_CLOCK`) controlling whether effects sync to BPM or run on a fixed 50Hz wall-clock timer.

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
- **Same exception — the palette type pages**: `/palettes` has one `navItems`
  entry; the four type routes (`/palettes/colour`, `/palettes/position`,
  `/palettes/intensity`, `/palettes/beam`) do not. They're reached via
  `PaletteTypeSwitcher`, which **is** sticky (unlike Values/FX — the four types
  are peers, not an editor and a diagnostic), plus four Cmd+K deep links from
  `usePaletteTypeNavItems()`. Note **no type owns the bare `/palettes` path**: it
  is its own redirect route to the sticky type. That is what keeps the redirect
  acyclic — its target is always a different route — so nothing here needs the
  `CARDS_LINK_STATE` escape the cards/list pair does. Three instances now; treat
  it as the rule for sibling views rather than a one-off.
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