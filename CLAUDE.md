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
  every render (see `templates` in `components/fx/FxColourTemplates.tsx`).
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

### Looks, templates and layers

**Two library entities, and a Layer applies either.** A **Look** composes cues: any families, its
own fixtures, its own effects, added to a cue's stack at a declared position. A **Template**
composes values: exactly one attribute family, no targets of its own, no effects, applied to a
selection. Backend contract in `lighting7/docs/lighting-composition-model.md` §"Looks and layers"
and `models/templates.kt`; the completed records are
`lighting7/docs/plans/completed/looks-and-layers-plan.md` and
`desk-simplification-plan.md` §Session 3.

They were one entity until session 3, split on the row's targeting mode: a **bound** Look behaved
like a palette, a fully-**deferred** one like a preset. That is now two tables, and the reason it
had to be is the design's own best example — a *per-fixture* template (eight heads aimed at one
spot hold eight different pan/tilts) has only bound rows, so `hasDeferredRows` could never have
told the two apart. What the split deleted: `editorFixtureType`, `LookEditor`'s synthetic-fixture
value grid, `LookDraftContext`, `LookLivePreview`, `syntheticFixture.ts`, `EditorContextValue`'s
`look` arm, and the type gate in `compatibleIdsFor`.

**A Look row is always bound** — `validateLookRows` refuses `deferred` — and a Look is always
*recorded*, from the programmer or by promoting a selection, which is why `/looks` has no New
button and one editor (`LookDetailSheet`, read-only about values on purpose; read its doc comment
before adding a value grid). A Look **effect** may still be deferred, and
`LookSummary.hasDeferredEffects` is what says so: that is what makes a Look eligible for a busking
pad, since a pad supplies the targets on the press.

**A template stores an intent, not a literal**, resolved per head at cook: a colour plus a
white/amber policy, a level or beam role as a percentage of each head's own range, a position in
**degrees**. `fx/TemplateIntent.kt` owns the grammar and `lib/templateIntent.ts` mirrors it — the
client half serialises and parses only, and **never resolves**, because
`fx/TemplateResolver.kt` must be the single answer to what the rig will do (§6 of the plan). All
three consumers go through it: cook, `POST /templates/{id}/apply`, and the editor's resolves-to
panel via `POST /templates/resolve`. Two deliberate degradations in that grammar are documented in
`TemplateIntent.kt`; do not "fix" either by teaching the literal parsers about intents.

**A template's property vocabulary is closed** (`TemplateProperty`), and that is where "a template
cannot carry a gobo" actually lives: gobo, colour-wheel and macro slots are per-model, so they are
refused by name at the write boundary and shown *disabled with the reason* in the beam editor
rather than omitted. Compatibility is **capability-only** (D6): "does this head have colour at
all", never "was this authored against that model".

There is **no stored attribute type on either**. `LookSummary.families` is derived server-side from
the rows, so a Look spanning colour and position reports both. A template's single family is derived
the same way and validated to be exactly one at the write boundary. That is why the **family filter
lives on `/templates`, not `/looks`**: a template is in exactly one family, so a family is an exact
partition; a Look spans families by nature, so filtering by one would hide most of the library from
most filters.

`src/lib/attributeFamily.ts` owns the family vocabulary and mirrors the backend's
`PropertyMaskGroup` — `store/programmerOps.ts` exports that name as an *alias* of
`AttributeFamily`, so the wire keeps its spelling without the two becoming separately-extensible
types; `maskPicker.test.ts` pins the two lists against each other, and
`templateIntent.test.ts` pins the template vocabulary the same way. It caught a real divergence
already: `Number('')` is 0 where Kotlin's `toDoubleOrNull()` is null, so the client read `pct:` as
0% while the server rejected the row.

**Within a cue, later layers win — for every attribute, intensity included**, and the cue's
own `propertyAssignments` are the last layer and beat all of them. Across cues, HTP still
governs intensity. That flip is the change an operator coming from presets is most likely to
be surprised by, so `LookStack`'s `precedenceNote` says it in the section body rather than leaving
it implied (it was `LayersPane` that said so until session 2a deleted that pane).
A layer's `sortOrder` is authoritative, not its array position: two layers sharing one leaves the
tie to insertion order in the cook step. Nothing renumbers client-side today — the programmer
stack asks the server to move a layer and takes the order back — so a client-side reorder would
have to restate every `sortOrder`, not just the two it moved. `lib/cueUtils.ts` kept two unused
helpers (`reorderCueLayers`, `densifyCueLayerOrder`) saying exactly that; they were deleted, and
the rule lives here instead.

**Layer order does not govern the value/effect boundary**, and per-layer `stomp` is the escape
hatch. Effects are Layer 3 and values Layer 4, so a lower layer's colour *effect* beats a higher
layer's static colour whatever the order says; `stomp` on the higher layer switches off the effects
of every layer below it, on every property it asserts. It is **suppression, not removal** — the
instance keeps running, so clearing the stomp brings it back mid-phase — and it applies to the
programmer stack as well as to a cue. `LookStack`'s `onSetStomp` is the toggle; the badge is what a
read-only row draws instead. Backend contract in `lighting7/docs/lighting-composition-model.md`
§Stomp, which is also where the *other* stomp lives — the cue-level, cross-cue, removing one. Don't
conflate them.

`buildCueInput` rebuilds `layers` and `triggers` **field by field**, and its comment says why. A
field missing from that rebuild is dropped on every inline cue edit; `cueUtils.test.ts` pins every
field of both individually rather than by deep-equal — a deep-equal against a fixture built in the
test file would pass just as happily with the same field missing from both sides.

**The `ref:{uuid}` value grammar is gone** — retired in session 4, on both sides at once,
because a client cannot render rows a server still produces. A cue or the programmer depends on
a Look through a **layer**, which names it by FK, and a layer's `propertyMask` is what expresses
"this property comes from that Look". What went with it: `parsePaletteRefUuid` /
`isPaletteRefValue` / `serializePaletteRef`, `ProgrammerEntry`'s five `palette*` fields,
`CellPaletteRef` and `describePaletteRef`, `PaletteRefNotice` and the four cell editors' notices,
the `FixturesTable` reference rail and its `Link2` corner glyph (the `Layers` glyph beside it
stays), the two `missingPalette*` health arms on both `AssignmentHealth` and `BindingHealth`,
`refRowCount`, and the programmer-wide Make Hard with its dialog.

Two things survived it on purpose. **`validateLookRows` still rejects a `ref:`-shaped value** at
the Look write boundary, as an inlined shape check with its own local constant — that rejection
*is* `FU-LOOK-NESTED`'s non-recursion guarantee, and it must not be deleted along with the last
reader of the grammar. And **`StateMigrations`' `removePrefix("ref:")` is the upgrade path**, not
dead code: it folds a v4 database's ref rows into layers. `LooksMigrationTest` spells the old
form out locally for the same reason.

`LookRefBadge` became **`LookNameBadge`** and changed more than its name: chain iconography and
"References …" titles both misdescribe a layer, so it draws `Layers` and names the Look plainly. It
takes an `isTemplate` flag since session 3 and swaps the glyph for `Palette` — same size, same
shape, because the two sit in the same list at the same rank and a louder chip would make one look
more important. **Never mint a `P<n>` short code for either**; display the name.

"Palette" now means **nothing at all** in this codebase, and that is the point. The word's last
sense — the positional ordered colour list FX parameters indexed as `P1`/`P2`/`P*`, scoped
`look > cue > global` — is gone, along with `PalettePanel`, `CuePaletteEditor`,
`ActiveStackPalettes`, `CuePaletteBar`, the `palette` column on cues / stacks / Looks,
`Cue.updateGlobalPalette`, `FxState.palette` / `stackPalettes`, the whole `PaletteSocket`, the
`set_palette` AI tool and `isPaletteRef` / `parsePaletteIndex` / `resolveColourWithPalette`. Any
remaining occurrence is a lucide icon, a 3D material list, or a comment about the *named* palette
entity that became a Look in session 4. **Don't reintroduce it in either sense.**

**An FX colour parameter names a template instead** — `tmpl:{uuid}`, whose helpers are
`isTemplateRef` / `parseTemplateRefUuid` / `serializeTemplateRef` in
`components/fx/colourUtils.ts`, mirroring `fx/TemplateColourSource.kt`. Five things about it:

- **This half serialises and parses only, and never resolves.** Same rule as `templateIntent.ts`,
  for the same reason: `TemplateResolver` must be the single answer to what the rig will do. The
  backend's `resolveColourGeneric` resolves a colour intent *without a head*, because an effect's
  output is one colour applied to every head it targets — so it resolves as though the head were
  RGBW, which makes an FX-referenced template identical to the same template applied as a layer on
  any RGBW/RGBWA head. **A head with no white emitter pays for that**, and by more than a stop:
  the neutral is already out of RGB and its white byte is dropped, so `#FF9D4A` arrives as
  `#B55300` — dimmer *and* more saturated, which is worse than the RGB-only reading rather than
  equal to it. Accepted trade, documented at `resolveColourGeneric`, one line to invert.
- **A reference is legal only in an effect parameter.** A cue row, a Look row and a programmer entry
  are literals; the dependency mechanism for a *value* is a layer. `validateLookRows` refuses a
  `tmpl:`-shaped value beside its `ref:` refusal, and `parseAssignmentValue` returns null for one
  rather than letting `parseExtendedColour` answer white.
- **Only single-row generic colour templates are offerable.** `family === 'COLOUR' && isGeneric`
  holds on both sides — a per-fixture template holds no single colour, so there is nothing for a
  fixture-agnostic output to take. The third clause, `rows.length === 1`, is this side's alone and
  is deliberate rather than a simplification: every consumer here reads `rows[0]` and only `rows[0]`
  — `swatchFor`, the chip's swatch, the chip's tooltip — so offering a two-row template would apply
  one of its rows under a name that claims both, silently. All three exclusions are pinned in
  `FxColourTemplates.test.tsx`.
- **There is no successor to `P*`.** A template holds one colour, so there is no set to expand; a
  colour list is an explicit ordered mix of literals and references. `FxColourListPicker`'s
  "Use entire palette" checkbox and its `savedValue` machinery went with it.
- **`tmpl:` rather than `ref:`** because `ref:{uuid}` is retired *and* still actively rejected at
  the Look write boundary — reusing it would collide with a live check.

`FxColourTemplates.tsx` owns both halves of the UI: `useColourTemplates()` (the offerable list plus
the three lookups a picker needs to draw a reference) and `FxColourTemplateRow` (the chips, plus
**Save `<hex>` as template…**, which fills the library the way `TemplateStrip`'s
new-from-selection chip does). Both pickers read `projectId` from the **route**, not a prop — the
FX library page has no project, and there the row simply offers nothing and still edits literals.

**The programmer is a layer stack too**, and `LookStack` (`components/looks/LookStack.tsx`) is
the one component that draws both — that sharing is the point rather than a saving, because a
cue *is* a saved programmer stack. Its seam is `LayerHandlers`, which is **index-based on
purpose**: the rows render a list and the operator acts on a position in it, so translating
index → whatever addresses a layer in that world is the host's job. The cue's host PATCHes
whole arrays through `buildCueInput`; `ProgrammerLookStack`'s maps index → `layerId` and sends
`programmer.addLayer` / `removeLayer` / `moveLayer` / `patchLayer`. It must not renumber
`sortOrder` client-side the way the cue path does — the server renumbers the stack and re-ranks
the running effects **in place**, so a drag doesn't restart any effect's phase.

`programmer.layerState` is the **third broadcast** frame (after `provenanceState` and
`programmer.includeTarget`), because the programmer is shared and a second tab's reorder must
not leave this one showing a stale order. It arrives two ways, and both are needed: as a
**unicast reply** to whichever socket sent the layer op (the acting tab's fast path), and as a
**broadcast** to every socket from `ProgrammerStore.layersFlow`. The broadcast was missing until
session 4, on the reasoning that "every layer mutation also emits `provenanceState`, which
already schedules the value re-read" — which is false for a mutation that moves no value. A
layer whose `targets` don't match its bound Look's rows asserts nothing, so adding, reordering
or disabling it emitted no provenance and left every other tab on a stale layer list. Found on
a desk, not by a test. The flow is emitted from `mutateLayers` rather than from `recook`,
because `reset()` bypasses the recook path and a full programmer clear must reach other tabs
too. Its handler still calls `notifyState()` only and deliberately *not*
`scheduleStateRefetch()` — the frame carries the whole stack, so there is nothing to re-read.
Layers ride a **separate** cache entry
(`useProgrammerLayersQuery`) rather than joining `ProgrammerSummary`, which the always-visible
`ProgrammerIndicator` reads.

Creating a **bound** Look and **update-back after Include** both work now —
`RecordLookSheet` (`POST /programmer/record-look`) and `updateIncludedLook`. `includedTargetIsReadOnly`
and the `INCLUDE_TARGET_READ_ONLY` conflict arm are gone with them.

**All three Make Hard routes are gone, and nothing replaced them.** They existed to swap
value-level palette references for the literals they resolved to, and the `ref:` grammar retired,
so there is nothing left to harden. A successor gesture — "promote a layer's *cooked* values into
local rows and delete the layers" — shipped briefly as `POST /{projectId}/cues/{cueId}/flatten`
and was deleted again in the backend sweep, uncalled. **Do not cite flatten as live**, and do not
add a button for it.

The two constraints that made it hard are worth keeping, because any reimplementation meets them
again. Rows come out **fixture-targeted, never group-targeted** — cook's output is per fixture by
construction and carries no group name, so the old route's "keep a group row when every member
agrees" cannot be reproduced without guessing which of several overlapping groups to name. And a
**single `layerId` can only be the last enabled layer**, because local rows beat every layer:
promoting a middle layer's values would make them win over the layers above and change the cue's
output, which is the opposite of what flattening promises.

Two things about the record sheet that are not arbitrary. The **mask is prominent** rather than
incidental — a palette bank implied its attribute, a Look has no type, so an unmasked record of
a busked state quietly captures position and beam alongside the colour that was meant; the
per-family counts (`familyForCategory`, at last with a caller) exist to make that visible
*before* it happens. And the **selection defaults on**, the opposite of `RecordSheet`: a cue
usually does want everything you busked, a Look named "Warm Amber" almost never does.

**Provenance names the winning layer.** `ProvenanceEntry` gained `layerId` and `layerSource` —
the resolved referent, `kind` + `id` + `name` — which `useRowOwnership` aggregates into
`CellOwnership.layer`, so "why is this fixture this colour?" answers *Warm Wash* rather than *a
cue*. Those fields **must stay in `provenanceSignature`**: a key can move from the cue to one of
the cue's layers with `source` unchanged, and a cell that didn't wake would keep naming the old
answer. The signature reads the whole `layerSource` object rather than its id alone, because a
Look layer and a template layer can share an int PK — that is the reason the entry carries a
source object at all, and matching on `layerId` would let a swap between the two look like no
change.

Both branches fill them in, and the `PROGRAMMER` one only since session 4: session 3a wired the
`CUE` branch from `cueLayerLayerWinners` and left the programmer branch building a bare entry, so
a cell lit by a busking pad answered *the programmer* and the layer-aware hover never appeared
there. The programmer branch has no resolver to ask, so it recovers the winning layer's **rank**
from the reserved `seq` band that `putLayerSlots` stamps
(`ProgrammerStore.layerWinnerRankByKey`), and reports only keys whose *winning* slot is the
layer's — a local busk sits above the layer slot, and naming the Look there would credit a Look
for the operator's own hand.

**The pads still go through `POST /looks/{id}/toggle`**, which is `programmerLayerStack.toggle`
server-side — it adds or removes a layer, matching on the **whole `LayerSource`** + exact `targets`
(matching on an id alone would let a Look and a template that share an int PK cancel each other).
Keeping one owner for that match rule is why they weren't moved to the explicit ops. What did change
is the ring: `lookLayerPresence` reads the **layer stack**, not the effect list. The old match was
`FxInstance.presetId === lookId`, which worked by accident (the Look id in a field naming a
`DaoFxPreset`) and could never see a rows-only Look at all. `templateLayerPresence` is its twin for
templates, and it is the *only* way a template pad can light: a template holds no effects.

`/fx-busking`'s pad grid takes both — Looks with deferred **effects** (a chase you point at a
selection) and every template — and it has no create affordance, because neither entity is authored
from a pad grid. It is also off-nav and reachable only by URL.

### The two apply gestures

A template has **two** presses, and the difference is invisible on screen — only the route called
says which happened, so both are stated on the chip's title:

- **click** → `POST /templates/{id}/apply`. Sets **literal** values in Local. Retuning the template
  later does not move them; this is the busking gesture, and it is why the retired `ref:` grammar is
  not missed.
- **⌥click** → `POST /templates/{id}/toggle`. Adds a layer that **tracks** it, targeted at the
  selection and masked to the template's family — **the server derives the mask** from the
  template's own rows, because which family a template layer belongs to is a fact about the
  template, not about the press. This repo sends its `propertyMask` anyway, as the belief it is
  acting on; the response reports the mask actually applied, so a disagreement surfaces there rather
  than silently on the rig. Retune the template and every layer moves. The layer *is* the dependency
  mechanism — it already was, for Looks — so "a colour I can change everywhere later" and "a colour I
  want right now" are two gestures on one chip rather than two kinds of template.

`TemplateStrip` lives in `ProgrammerGrid`'s `renderToolbar`, which already hands down the marquee's
`cells` — so **the selection is the filter** with no new plumbing: select colour cells and only
colour templates are offered, and there is no picker to open or family dropdown to get wrong. Rows
selected but no cells means the gesture names no attribute, so everything is offered rather than a
family being guessed. `TemplateStrip.test.tsx` pins the filter and the click/⌥click split.

**New from selection** is server-side (`POST /templates/from-programmer`), for the same reason apply
is: converting a recorded *literal* back into an **intent** is per-head arithmetic that has to agree
with the resolver. It also decides **generic vs per fixture from the data** — one row per property
where every selected head agrees, one row per head where they do not — rather than from a toggle,
because the operator already said which they meant by putting the heads where they are. The
colour inverse is a documented heuristic (fold the emitters back into RGB, policy `extract` when
either was driven); it lives in one place, `templateRecord.kt`.

### The programmer's scoped grid

Session 2a gave the programmer's value grid a **scope**, and it is the mechanism most of the session
rests on: Output (the cook, read-only), Local (what *you* set, and nothing else), or one focused Look
layer. Same grid, same cell editors, same drag-select in all three — that sameness is the point,
because it is what makes editing a Look feel local rather than like a trip to the library.
`components/programmer/ProgrammerScope.tsx` owns it; the band above the grid is
`ProgrammerScopeBand`, and a layer is focused by clicking its name badge in the stack rail.

Things that will bite:

- **The grid must never remount on a scope change.** `useListSelection` clears its Redux scope on
  unmount, so a conditional mount or a `key` per scope silently discards the fixture selection
  Record scopes on. `ProgrammerPage.test.tsx` asserts `gridMounts` across a switch; that is the
  load-bearing test of the whole session.
- **`null` scope is not Output.** `/fixtures` and `/groups` mount the same table with no scope above
  them and must behave exactly as before — live values, editable cells, no em-dashes. Only an
  *explicit* Output scope is read-only. Pinned in `FixturesTable.test.tsx`.
- **`ChannelSource` is the wrong abstraction here** and was rejected: everything a derived source
  doesn't hold reads 0, and `holds()` is on `DerivedChannelSource` rather than `ChannelSource`, so it
  cannot express *unset* — which is the entire point of Local. A Look row can also name a group,
  which has no channel. `scopedCellValue.ts` instead feeds the *same* `aggregateCellValue` a lookup
  built from entries or rows, so the maths behind a cell is identical in every scope.
- **The Local predicate is `entry.owner !== 'layers'`**, not provenance: under blind, provenance
  reports what is *underneath* the programmer, and a parked property reports `PARKED` while still
  holding the operator's entry that Record would take.
- **An un-busked Local cell shows an em-dash but its editor opens at the live value** (`placeholder`
  on the four cells, `UnsetCellMark`). Local has to answer "what will Record take?" by itself, and a
  busk still has to start from where the rig is.
- **A layer-scope edit is a live write.** It goes through `PUT /looks/{id}`, which republishes every
  cue layering that Look — the point of composing in place. `LookRowDraft` coalesces at 400 ms with
  a 2 s ceiling, and **flush cadence is stage-update cadence**: a colour drag steps the rig rather
  than gliding, which the band says out loud. There is no smooth-preview escape hatch — backend
  sweep item D4 deleted the Look preview routes and `ProgrammerLayerStack.installPreview` with
  them, so no layer can carry an unsaved draft any more and `ProgrammerLayer` has no `isPreview`.
- **`RowCell.targetKeys` is index-parallel to `resolutions`** and `keys` is not: one resolution can
  contribute two keys (a position paired from pan/tilt sliders), so for a group row the two arrays
  share neither length nor indices. Ownership never noticed because it collapses to one verdict.
- **Widening a layer's targets is always explicit** — the `AddToTargetsButton` on the row, never a
  side effect of dragging a marquee across the grid.
- **A focused template layer shows no rows at all**, and per-element Look rows stay out too — both
  are named in `LayerRowNotices` instead. Projecting a template's generic row onto every targeted row
  would silently convert it to a per-fixture one on the first edit, which is a change to what the
  template *is* made by someone adjusting a value; element rows compose nowhere at all
  (`FU-LOOK-ELEMENT-ROWS`). `LookRowStore` therefore engages **only for a LOOK layer**, and
  `+ Effect` is disabled on a focused template (D7 — a template holds no effects).
- **In Output scope every tint is a destination**: clicking a cell jumps the scope to whatever won
  it. Three guards, and the middle one bites — `ProvenanceEntry.layerId` is present for a **cue's**
  layers too, so `focusLayer` checks membership in the programmer's own stack and reports failure.

`+ Effect` follows the same rule as a value edit: focused layer → into that Look (via
`POST /looks/{id}/absorb-effects`, which *moves* the running instance); Local → the programmer band,
which Record writes onto the cue; Output → disabled, naming the two places that can take one.
**Make layer** promotes a Local selection into a named Look applied here — record-look, then
`addLayer`, then `clearEntry` per row taken, so what you promoted leaves Local and the rest stays
yours. It is a sequence, so a failure part-way leaves the Look and says so.

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
switcher. `components/SpeedMasters.tsx` is the ShowBar's performance surface, and it shows
**every** master, master 1 included. It used to render 2..N on the reasoning that the
ShowBar's own BPM tile *was* master 1; that tile is gone, and the split was the width bug —
two thresholds fired at 560px in opposite directions, so between 560 and 900px the tiles and
the transport left the live-state block nothing and its cue numbers spilled. Don't
reintroduce it: the component's docblock is the record of why. It picks one of three arms
from the bar's `@container` width **and** the master count (`TILED_ARM`, because a container
query cannot see how many masters there are): a named tile each, one railed tile with a pill
per master, or `SpeedMastersChip` below 440px.

Two independent per-effect references, both uuid-addressed:

- `speedMasterUuid` — which tempo an effect's beats come from. BEAT effects only.
- `rateSpeedMasterUuid` — scales a **WALL_CLOCK** effect's cycle (`bpm / 120`). Beat
  effects never read it.

`EffectParameterForm` gates on the library entry's `timingSource`: a wall-clock effect
gets "Cycle length (seconds)" and the rate picker, a beat effect gets beat divisions and
the speed picker. Showing both to both was the pre-existing bug — a wall-clock effect's
"Speed Master" did nothing at all.

`BeatIndicator` pulses from the keyed `speedMasters.beat` stream, always — the unkeyed
legacy `beatSync` it used to fall back to is gone from both sides (backend D2). Omitting the
master, or passing master 1 with a null uuid, resolves to master 1's **real row uuid** through
`useMaster1Uuid` in `store/speedMasters.ts`: null means master 1 only on the tempo *write*
messages, and an `''`-keyed subscriber matches no frame at all. Server frames are throttled
(one per 16 beats), so the component free-runs a local timer in between — that interpolation
is load-bearing, not decoration.

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
Cues bundle an ordered stack of **Look layers** (see §Looks and layers), their own property assignments, ad-hoc effects, and **script hooks** into named snapshots. **Every cue belongs to a cue stack** — there are no standalone cues. A project owns an *ordered* list of stacks (the "show"); a stack owns an ordered list of cues. A stack row can also be a **SEPARATOR** (a label-only divider between stacks). Cues and stacks are authored **and run** entirely in the **Show** view (`/projects/:projectId/show`, drilling into a stack at `/show/stacks/:stackId?cue=:cueId`) — the old separate "FX Cues" view has been removed, Show was itself called Program until the programmer moved out of it into `/programmer`, and the separate **Run** view folded into it in session 2b (see §Navigation Registry and §The show-editing lock).

#### The show-editing lock

**`/show` is the runner and the editor, separated by a lock rather than a route.** `useEditLock`
derives it:

```
locked = !canEdit || (isShowActive && lockRequested)
```

Six things about it are load-bearing:

- **It is a stray-click guard, not access control.** The backend has no notion of it and no route
  refuses a write on its account, so a second client can edit a "locked" show. Dressing it as
  permission would be worse than not having it. `canEdit` is not a role either — the backend
  computes it as "is this the current project".
- **It is not the transport gate.** GO must work while locked; locked *is* the normal running state.
  `canOperate` on `useShowTransport` is a different question and must never be handed `locked`.
- **A stopped show is simply editable**, with no lock chrome at all — there is nothing to protect,
  so there is nothing to warn about. `lockRelevant` gates the chrome.
- **`lockRequested` lives in a Redux slice** (`store/editLockSlice.ts`), shared with the Prompt Book,
  because "I am in a fix-it session" is one fact about the operator and one GO should end it
  everywhere. It is **never persisted**: a running show always opens locked. The re-arm effect
  therefore fires on the stopped→running *transition* and not on mount, or navigating between the two
  surfaces would re-lock and the sharing would be pointless — `useEditLock.test.tsx` pins that.
- **Dragging is disabled through dnd-kit's own `disabled`**, per sortable, never by unmounting the
  `DndContext` — `useSortable` needs that ancestor, so removing it breaks every row. Affordances are
  **hidden rather than greyed out**: a row of disabled destructive buttons reads as breakage.
- **Transport shortcuts act only while locked**, via `useTransportKeys`, on **both** lock surfaces;
  `L` stays bound in both states so there is always a keyboard way back to a safe desk. Unlocked, the
  row's cue number, name and fade are live text fields, and in an editing surface Space is a space.
  That handler took the *union* of the two it replaced — a focused button must not fire GO as well as
  activating itself, which is a double advance the old Run handler allowed.
- **Unlocked-while-running washes the header amber** — `ShowHeader`'s `unlockedWarning`, on both lock
  surfaces. The signal is for the *unlocked* state, not the locked one: locked is the quiet default,
  and believing you are locked when you are not is how a show gets edited by accident. A stopped show
  is simply editable, so there is nothing to warn about and no wash. The border is always present and
  transparent, so colouring it cannot shift the layout as the lock flips. The Prompt Book's toolbar
  drew this itself until 2b; two adjacent amber bars said it twice.
- **The lock control is `ShowLockControl` in `ShowHeader`'s `actions` slot**, on Show *and* the Prompt
  Book. The Prompt Book used to draw its own in its toolbar, so one control sat in two places
  depending on the view. It carries the Prompt Book's extra case: where the backend will not accept
  edits, the control is shown but **inert**, because it is the only thing saying why.

**One `ShowBar`, identical on all three live views.** Every host spreads `showBarProps` from
`useShowBarProps` and overrides exactly one prop — `showShortcuts`, which advertises keys and so can
only be answered by the host that binds them. Everything else comes from the hook, which is what
stops the bar drifting into three near-copies: it previously had no Blind on the Prompt Book, a
different stack-name rule on Show, and a hand-wired transport on the Prompt Book that gave that page
two transport instances.

- **The bar is not gated on the show running.** It carries blackout, Blind, the speed masters and the
  programmer chip, all of which mean something with the show down, and `goDisabled` already mutes
  BACK/GO. Gating it was what made **Blind's location depend on the show's state**.
- **Blind lives in the bar, beside blackout** — the same class of thing (a gate on what reaches the
  rig) in the one piece of chrome every live view shares. It was in the programmer's action-bar Stage
  zone, which meant the same control was in one place on the Programmer and another on Show. It still
  fades by the programmer's own fade time: `useShowBarProps` reads it at press time from the
  `programmerFade` store the action bar's picker writes, so moving the button did not turn a fade
  into a snap. That store is module-level for a reason — as two `usePersistentState` instances of
  one key it was two mount-time snapshots, and Blind snapped for the rest of the visit. Do **not** make `ProgrammerIndicator` the toggle — it is also the link to the programmer, and
  one control cannot be both without one of the two jobs becoming a surprise. That indicator instead
  takes `blindShownSeparately` in the bar, so it reports only the value count there: it normally
  draws its own amber Blind badge, which beside the tile was the same word twice.
- **DBO beside it is still inert** in every host — local state, no side effect
  ([`FU-FE-DBO-INERT`](../lighting7/docs/plans/followups.md)). Two identically-styled adjacent tiles
  of which one works is the part that must not stand.

**Browsing a stack never moves the playhead.** A tab click used to run
`deactivate(old) → goToStack → deactivate(target)`, so one unconfirmed press took the live cue off
stage and repositioned every other client. `StackTabStrip` now takes `selectedStackId` (the underline)
and `liveStackId` (the green pip) as separate props, and arming is an explicit, confirm-gated control
in `OffPlayheadBanner`. The confirmation is not ceremony: `POST /show/go-to` deactivates the stack
being left and then calls `activateAtFirstCue` on the target, so the target's first cue genuinely
fires and the desk darkens it again — a visible blip on top of losing the current cue.

**Two cursors reach a cue row, and neither is a mode.** `serverActiveCueId` places the stable
"on stage" marker; `activeCueId` (the optimistic runner cursor) says which row owns the fade chrome.
During a crossfade those are different rows, so one value cannot serve both. The fade *value* is
never a prop — each row reads its own through `useCueFade`, because `ShowView` is memoized
specifically to stop several hundred rows reconciling at frame rate, and passing `fadeProgress` down
would defeat that with the memo still in place, looking effective.

**Each server run fact has one owner.** The RTK cache owns what the server says
(`stack.activeCueId`, `stack.nextCueId`); the runner slice owns what is local — the animating
cursor, the optimistic next (`standbyCueId`), done ticks, fade/auto descriptors — plus a private
memory of the last frame it adopted (`serverActiveCueId`), which exists because a reducer cannot
read the cache. That slice field is **not** a substitute for `useShowTransport`'s own
change-tracking ref: the optimistic mutation patches move the cache with no frame, and a snapshot
frame moves both stores at once, so "do the stores disagree" and "did the cache move" are
different questions (the reconcile effect's docblock spells this out). Surfaces read cursors
through `useShowTransport`, whose docblock maps who reads which and why; don't hand-compute
`activeStack?.activeCueId` in a view, and don't add a second cache copy of a run cursor (the
armed-only `CueStack.standbyCueId` was exactly that — written twice, read never — and was
removed).

**Expansion is one addressed card plus the live one, derived.** `?cue=` holds the operator's card;
the cue on stage is expanded on top of it by `useCueExpansion`. So a GO opens the new live card and
cannot take away the one being read. Run kept a `Set` and never removed from it (five GOs, five open
cards); Show kept a bare scalar a GO would overwrite.

**Cue numbers** are free-form display labels (`sortOrder` is the authoritative playback order). They are parsed as **prefix + decimal run + suffix** (`S1-3.1` → `("S1-", [3,1], "")`) and only ever compared *within a prefix group*, so `Pre-show 1, Pre-show 2, T2-1, S-1, S-2` is correctly ordered. `src/lib/cueNumber.ts` holds that model and drives the "Fix Order" banner; it mirrors `routes/cueNumbering.kt` in lighting7, which performs the fix — **keep the two in step**.

A cue without an explicit number gets one derived from its position (`cueNumberAuto: true`), recomputed by the backend whenever the stack changes. Auto numbers render dimmed via `AUTO_CUE_NUMBER_CLASS`; clearing the `Cue #` field returns a cue to auto.

**A cue is read-only, and edited by Include.** Session 2a deleted the three-pane inline editor
(Targets · Cue properties · Layers) and its tab chrome: those panes restated, in a different shape,
what a value grid and a layer stack already say, and two renderings of one state do not stay in step.
An expanded cue row now shows `CueDetailContent` — transition, notes, **its composed
values** (`CueValueGrid`), layers, effects, hooks — all read-only, with **Edit in Programmer** (which
Includes it) and **Cue properties…** (`CuePropertiesSheet`). Consequences worth knowing:

- **`CueValueGrid` reads `GET /{projectId}/cues/{cueId}/cooked`**, which wraps the same
  `buildCombinedCueLayerRows` the GO path runs. Do **not** compose a cue's values client-side —
  layer order, masks, per-layer amount and blend, group expansion and specificity would all have to
  be reimplemented, and each is a place for the desk and the display to disagree. It borrows the
  four cell components rather than mounting `FixturesListContainer`: that container owns a filter,
  checkboxes and a marquee, and its selection is Redux-scoped to one of three scopes.
- **"Add Cue" is gone.** A cue is a captured state, so recording is the only way one is made;
  `StackDetail` offers *Record into `<stack>`*. Separators and stacks keep their create buttons —
  neither is a captured state, and that is the line rather than "no new buttons". The Prompt Book's
  `CueAnchorPickerSheet` also still creates a cue at an anchor, deliberately.
- **`CuePropsPane` survived, relocated.** It was not the problem with the three-pane editor, and a
  per-field autosaving form is right for cue metadata; it is now the body of the properties drawer.
- **`EditorContextValue` has no `cue` arm**, and the `cueEdit.*` protocol no longer exists on
  either side. Session 2a stopped providing the arm; 2b removed it, along with its four session
  helpers, `api/cueEditWsApi.ts` and the fifteen `kind === 'cue'` branches, having decided that
  giving a cue row editable cells would make a cue and the programmer two places to set a value
  again. The backend sweep then deleted the family server-side, so the `409 CUE_EDIT_SESSION_OPEN`
  handling, the `force` request field both Record and Update sent, the two "do it anyway" buttons
  and the Diagnostics `cueEdit` histogram panel are all gone too. Don't reintroduce any of it:
  a cue is edited by Include, and `EditorContext.tsx`'s doc comment is the record of why.
  `INCLUDE_TARGET_GONE` is Update's own 409 and is unrelated — that one is live.

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
  five that do are in `IdentityRow`, `routes/CloudSync.tsx` (the hub's "Add remote
  project"), `components/cloudSync/ConfigPanel.tsx`, `components/cloudSync/StatusPanel.tsx`
  and `Projects.tsx`.
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

**Reconnect resync is central and derived.** `store/status.ts` invalidates every tag in
`REST_TAG_TYPES` (exported from `store/restApi.ts`) on a CLOSED→OPEN transition, minus a short,
argued exclusion set — `Auth` only, because `AuthGate` already fetches `auth/status` on the first
connect and `authWsApi` carries the `seenOpen`-guarded catch-up for genuine re-opens. Do **not**
add an `open` branch to a WS bridge just to re-invalidate its own tag: that duplicates the central
dispatch, and the hand-maintained list it replaced had drifted to 15 tags of 47 while claiming to
cover them all. An `open` branch is still right when it re-sends something the *server* forgot —
`speedMastersWsApi` re-requests its one-shot beat subscriptions, which live on the server's
per-connection scope — but it should then do only that.

The dispatch is **debounced and waved**, not one tick: a reconnect usually means the backend has
just restarted, and lighting7 serves REST from a single pooled SQLite connection, so the whole set
arriving at once serialises behind a show that is still warming up. `RESYNC_DEBOUNCE_MS` lets a
flapping link settle, then `RECONNECT_RESYNC_WAVES` goes out `RESYNC_WAVE_SIZE` tags at a time,
operator-visible caches first; a drop mid-sequence abandons the rest. The waves are a transport
detail only — `src/store/status.test.ts` pins that they concatenate to exactly the resync set, so
a tag can never fall out by landing in no wave.

### Where a WS bridge subscribes

A "bridge" is a store slice's standing `lightingApi.<x>.subscribe(…)` that turns a pushed frame
into a `dispatch` — usually an invalidation. There are three places to put one, and the choice is
not stylistic:

1. **At module scope — the default.** A bare `lightingApi.x.subscribe(...)` statement at the top
   level of the slice. Use this unless one of the other two applies. It runs once, when something
   first imports the slice, and lives for the life of the tab; that is right for a bridge whose job
   is to keep a cache honest whether or not anything is currently rendering it.
2. **Deferred, started from `main.tsx`** — an exported `startXBridge()` the slice does *not* call
   itself. Use this **only when the slice sits on the earliest render path**: imported, directly or
   transitively, by something that renders before or during the first paint — the sidebar and its
   nav registry (`src/navigation.ts`), `Layout`, `AuthGate`, the boot overlay, or a picker those
   mount. The hazard is a runtime import cycle: if any module in `api/lightingApi`'s own import
   closure reaches back to the slice, the slice's body can run while `lightingApi` is still
   mid-initialisation, and touching it there throws a TDZ `ReferenceError` that takes *every export
   of the slice* with it. `tsc`, `vite build` and the unit tests all pass anyway — the symptom is a
   blank-looking app in the browser. `store/oauthGithub.ts`'s doc comment is the long version.
3. **Per cache entry, inside `onCacheEntryAdded`** — not a bridge at all, but the right answer for
   a *stream* rather than a notification: the value itself arrives over WS and there is nothing to
   refetch. Subscribe when the entry is created, `updateCachedData` on each frame, unsubscribe on
   `cacheEntryRemoved`, and seed `queryFn` from the WS layer's cached snapshot so a late mount does
   not render empty. `store/speedMasters.ts` (`speedMasterLive`) and `store/surfaces.ts` (devices,
   banks, pickups, scaler) are the worked examples. Prefer this over `useState` + `useEffect` in a
   hook: two components reading one stream then share a subscription, and RTK Query owns teardown.
   **Not for a stream that moves at frame rate**: `updateCachedData` is a dispatch, so a per-channel
   entry over `channelState` costs the whole store a reducer pass and a subscriber scan per channel
   per frame, for a value nothing outside the reading component consumes. Those read the WS layer's
   own per-key subscription through `useSyncExternalStore` instead — `useChannelValue` and its
   neighbours in `hooks/usePropertyValues.ts`.

The census as of this writing, so a new slice can see which company it is in: **25 module-scope
sites across 19 slices** (`grep -n '^lightingApi\.' src/store/*.ts`), and **four deferred**, all
started from `main.tsx` — `oauthGithub`, `looks`, `templates`, `programmerErrors`. The imbalance is
the rule working, not drift: form 1 is the default and form 2 is the exception, and the four are
exactly the slices the sidebar and the first paint reach.

Nothing is being migrated toward form 2. `import/no-cycle` is an ESLint **error** in this repo, so
the precondition for the TDZ hazard — an import cycle through `api/lightingApi` — cannot reappear
silently; the four deferred bridges stay deferred as defence in depth for the render-order half,
which the lint rule does not see.

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
- **There are three live views: Programmer · Show · Prompt Book.** The programmer is
  `/projects/:id/programmer` (`ProgrammerPage`); `/show` (`ShowPage`) is *both* the
  cue/stack authoring surface and the runner. `/program*` and `/run*` both redirect to
  the `/show` equivalent, and `/program*` **carries the search string**, because
  `?cue=` deep links are how the Prompt Book's "Edit cue" reaches a cue.

  **Run is gone as a route, replaced by a mode.** Run and Show were never different
  destinations — the only real distinction was whether a stray click can change the
  show, which is a *mode*, and one the Prompt Book already modelled. So the lock came
  across instead of the route (see §The show-editing lock). Both levels of the view
  survive in both modes: locked, `/show` is the runner with a state pip, fade chrome
  and click-to-arm; unlocked, it is the same list plus drag, inline edit and the
  create/delete affordances. Two layouts under one switch would have been two views
  with extra steps.

  The programmer's own arrangement is the third it has had, and the reasoning for the
  second is what makes the third safe to state. The programmer was once its own page, then three tabs of a
  collapsed pane inside Program with no nav entry — the argument being that Values /
  Layers / FX are three readings of *one live object* rather than three destinations,
  and that a second sidebar row pointing at one page was the `"/program"` vs
  `"/programmer"` collision. The tabs premise held; the *pane* did not. Three readings
  of one object is an argument for showing them **together**, not for a switcher, and
  a collapsed pane could never do that. So: no tabs, and a page with room. Renaming
  Program to Show removes the near-collision outright.

  Two traps that survive both the rename and the merge:

  - **`pathMatch` never uses `startsWith`.** `mostSpecificActiveId` now lives in
    `lib/navMatch.ts` and matches whole trailing segments (`endsWith(m) ||
    includes(m + '/')`), longest wins. `navMatch.test.ts` pins `/programmer` and
    `/show` apart so the collision cannot come back by accident.
  - **`ProgrammerIndicator` does the same test by hand** and must keep the
    segment-aware form. It is a trap in both directions: while it pointed at
    `/program`, the sibling `/projects/1/programmer` *did* start with it.

  `/programmer/fx` still redirects — FX was a route, then a tab, and is now a band of
  the page. The old "reset the FX tab to Values on mount" rule retired with the tabs;
  the diagnostic-read argument lives on as `FxSheet` being a collapsible under
  `ProgrammerFxList`, closed by default and **mounted only when open**, because it
  builds a second full fixture row model and re-renders on every programmer event.
- **Two libraries, two entries, and the filter is on the other one now.** `/looks`
  and `/templates` are separate `navItems` entries and separate routes, because they
  are separate entities (see §Looks, templates and layers). `/looks` has **no family
  filter at all**: a Look's families are *derived* from its rows, so one covering
  colour and position belongs to two banks at once and filtering by one would hide
  most of the library from most filters. `/templates` has the sticky filter
  (`LookFamilyFilterBar`, kept under its old name — a private storage key nobody reads
  by name), and there a family **is** an exact partition: a template holds exactly one.
  `useTemplateFamilyNavItems()` gives Cmd+K four deep links as `?family=` query params
  on the one route, with `pathMatch` the bare `/templates` so the sidebar highlights its
  single row whichever family you arrived in — asserted in `navigation.test.ts`, which
  also pins the two `pathMatch`es apart.

  Note this is no longer the "where sibling routes do not apply" exception it was
  written as: on `/templates` sibling routes *would* partition cleanly, and it is still
  one route because the filter is a **view** of a small library rather than a division
  of it. Reach for sibling routes when the sub-views partition the resource *and* the
  operator navigates between them (cards/list, an editor and its diagnostic); reach for
  a filter when the whole library is worth seeing at once.
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