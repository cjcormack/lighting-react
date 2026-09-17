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
├── routes/           # Route components (pages) — see "Components" for what may live here
│   ├── Channels.tsx      # DMX channel control
│   ├── Fixtures.tsx      # Fixture management
│   ├── Scenes.tsx        # Scenes and chases
│   ├── Scripts.tsx       # Kotlin script editor
│   └── legacyRedirects.tsx  # Redirects for paths that no longer name a view
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
own fixtures, its own effects, added to a cue's stack at a declared position. A **Template** is
**one named thing** of exactly one attribute family, with no targets of its own, applied to a
selection — either a value, *or* one effect, never both (`fx-templates-plan.md` D1). Which of the
two it holds is `kind`, and it is fixed at creation the way the family is; three rules keep the
effect half narrow, and each removes a way for it to complicate the cook: **a value or an effect**,
**one effect** (several together is what a Look with deferred effects already is), and **always
generic** (an effect fans over whatever the layer names, so `isGeneric` is true for every one).
A **Beam** template holds values only — the effect library has no beam category, and the backend
refuses `beam`, `controls` and `composite` **by name** so a script-registered beam effect cannot
mint one behind the rule. Backend contract in `lighting7/docs/lighting-composition-model.md` §"Looks and layers"
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

**The one literal is a bundled emitter — `dmx:180`.** White, amber and UV are rows of the closed
vocabulary in their own right, family COLOUR, and the departure from "an intent, not a literal" is
deliberate: an emitter has no range to be a proportion of and no room to be a position in, so there
is nothing to re-derive per head. Keep the `dmx:` prefix — a bare `180` is what the *literal* parser
reads, so the two grammars would agree on some rows and silently disagree on others. Rows rather
than fields on the colour intent, because each then writes only its own channel: that is what lets a
UV-only template sit **over** an amber wash instead of replacing it, and it is the only way to say
"UV at 200" at all, since no `WhitePolicy` has ever driven UV. An explicit `white` or `amber` row
**forces the colour row to `rgbonly`** — the policy drives the same byte — which `ColourControl`
enforces by rewriting the stored intent (not just the button's variant: showing RGB only while the
value still said `extract` produced an editor displaying a template it could not save) and the write
boundary refuses by name. UV is exempt.

**A colour template refuses as a whole**, and this is the one place compatibility is finer than D6.
A head missing any emitter the template names takes *none* of its colour rows —
`TemplateResolver.unmetColourRequirement`, folded in by cook, apply and the resolves-to panel alike —
because the rows are facets of one output and half a colour is a wrong answer, not a partial one.
Scoped to COLOUR: zoom and frost are independent roles and keep their per-row skip.
`TemplateSummary.requiredEmitters` is the derived form the client filters on, paired with
`targetEmitters` in `fixtures-list/rowModel.ts` — a **union** over the selection, like
`targetFamilies` beside it, so a mixed selection still offers the template and the head that cannot
take it reports a skip. `targetEmitters` must read the **colour descriptor's** `whiteChannel` /
`amberChannel` / `uvChannel`: bundled emitters are omitted from the flat descriptor list, so
scanning categories the way `targetFamilies` does finds no emitter on any head.

**A template's property vocabulary is closed** (`TemplateProperty`), and that is where "a template
cannot carry a gobo" actually lives: gobo, colour-wheel and macro slots are per-model, so they are
refused by name at the write boundary and shown *disabled with the reason* in the beam editor
rather than omitted. The three emitters are *in* the vocabulary — not slotted, and the only
per-model question about them is presence. Compatibility is otherwise **capability-only** (D6):
"does this head have colour at all", never "was this authored against that model".

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
be surprised by, so it is said out loud rather than left implied: the programmer rail draws its
stack **top wins** — the Local values row first, then the layers strongest to weakest — under a
`VALUES · top wins` label whose hover is the full sentence, and `LookStack`'s wide density keeps
the sentence as its `precedenceNote` paragraph (it was `LayersPane` that said so until session 2a
deleted that pane). The dense density *reverses only the rendering*: the order badge and every
index a handler receives are still the array's, which is `sortOrder` ascending.
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
programmer stack as well as to a cue. `LookStack`'s `onSetStomp` is the toggle; a read-only row
draws a badge instead, and the dense row draws both — the badge on the row, because stomp is the
one setting that changes what the rows *below* do, and the toggle in its popover. Backend contract in `lighting7/docs/lighting-composition-model.md`
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
- **Only generic colour *value* templates are offerable.** `family === 'COLOUR' && isGeneric`
  holds on both sides — a per-fixture template holds no single colour, so there is nothing for a
  fixture-agnostic output to take. The third clause was `rows.length === 1` and is now
  `kind === 'value'`, which is exactly the swap that clause's own docblock said to make if it were
  ever relaxed: it excluded an effect template only by the accident of holding no rows. The count
  went because a colour template may hold a hex *and* explicit emitters, and both sides now fold the
  whole colour-family row set into one colour — `templateRowsSwatch` here, `resolveColourGeneric`
  there. **Never read `rows[0]` for a template's swatch**: row order is authoring order, so a
  template whose `uv` row sorted first was drawn purple under an amber name. All three exclusions
  are pinned in `FxColourTemplates.test.tsx`.
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
`programmer.removeLayer` / `moveLayer` / `patchLayer` (`addLayer` is `ProgrammerAddLayerSheet`'s,
since the rail's footer and strip own adding). It must not renumber
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
is the ring: `lookLayerPresence` reads the desk's **resolved applied state** (`programmer.applied`,
from `useProgrammerAppliedQuery`), not the effect list. The old match was
`FxInstance.presetId === lookId`, which worked by accident (the Look id in a field naming a
`DaoFxPreset`) and could never see a rows-only Look at all. It then read the layer stack directly,
expanding groups client-side; the desk resolves that now — `ProgrammerLayerStack.appliedState` sends
one entry per record naming every target it covers, each group marked `all` or `some` — so all
these functions do is fold the selection into one ring. Two copies of a coverage rule drift, and the
copy in the browser is the one no test against the rig can reach. `templateLayerPresence` is its
twin for templates, and it is the *only* way a template pad can light. That used to be because a template
held no effects; it holds one now, and the rule is *more* load-bearing rather than less — an
effect-template pad's ring would look matchable against the running instance, and matching there
would light for an effect template while leaving every value template's pad dark.

The **busk view**'s pad grid takes both, and takes **cues** besides — but it no longer decides where
any of them go. A pad sits where the operator put it, in a bank on a page they built (see §The busk
layout); the library's family says nothing about the arrangement. What survives from
the old automatic layout is the pad *face*: an effect pad is a pad like any other — same component,
same presence ladder, same long-press — and only its wave glyph says what it holds. The paragraphs
below describe the pad face only.

**`/templates` is a flat list ordered by name, and there is nothing to drag.** A template carried an
operator-set position and could sit in a *group* whose pads released each other; both went with the
automatic layout, because both were things the busk page does better — order is a pad's place in a
bank, exclusivity is a solo bank's. `TemplateLayoutList`, `TemplateGroupRow` and
`lib/templateLayout.ts` are deleted, `/templates/reorder` and the `/template-groups` CRUD with them,
and `TemplateSummary` carries no `sortOrder` and no `groupId`. **Do not reintroduce a stored library
order**: the only orders a template has are this page's name order and the programmer row's
recency, and neither is a field. The programmer's `TemplateStrip` drew this same name-ordered list
until it became a recents row — see §"The two apply gestures", where the row is the eight most
recently *pressed* and name order is only the fallback for a library nothing has been pressed from.

The **family filter** stays, and is the page's only partition: a template is in exactly one family,
so `?family=colour` is a view of a small library rather than a division of it, and it deep-links
from Cmd+K. The footer says how many of the whole library the bank is showing.

A colour pad carries a **swatch**, but only when the
template is generic and single-row — `templateSwatch` in `components/busking/padFace.ts` makes
the same two exclusions `isOfferable` makes in `FxColourTemplates.tsx`, and for the same reason:
`rows[0]` under a name covering several rows states one of them as the whole thing. An effect
template has no rows, so it draws the wave in the swatch's place and an `EffectPadDetail` line
(`Colour Pulse · ½ · M2`). That detail is a **component** and not a string built by the caller,
for `EffectShape`'s reason in `TemplateListRow`: the master's label is a live value, hooks cannot be
conditional, and a hook in the loop would make every value pad in the library subscribe to the
master bank.

### The busk layout

**The busk page is a thing the operator builds, not a view the library lays out.** A page is rows; a
row is columns, each with a **width share in twelfths**; a column stacks banks top to bottom; a bank
has a name, a `solo` flag and a `flow` (`WRAP` | `COLUMN`) and holds ordered **pads**, each a
reference to exactly one template, Look or cue. One record may sit on several pads, on several
pages. Backend contract in `lighting7/models/buskLayout.kt` and
`lighting7/docs/lighting-composition-model.md` §"The busk layout"; the plan is
`lighting7/docs/plans/completed/busk-layout-plan.md` and the design authority is `look-groups-design/`.

It replaced an automatic layout — four family columns of templates, a Looks pool, a cue column of
stack cards and pinned-cue pads. The reason is the one a template group could not meet: a group
holds **one family**, and the operator's actual ask (a position palette and a movement pattern that
must not run together) needs a cluster holding both, plus cues. So order and exclusivity moved to
the page, and the library went back to being a flat list.

**A press goes through the pad, and the bank decides the siblings.**
`POST /busk/pads/{padId}/press` is the *only* press on this surface — the three kind-specific
mutations (`toggleTemplate`, `toggleLook`, `goToStack`) are the programmer's ⌥click / touch-hold
strip's and the AI's now. It has a second door since the MIDI surface's session 4: a `PressPad` binding runs the
same `BuskPressService` with the desk selection as the targets, which is why that service exists at
all — the solo rules and the refusals are the pad's behaviour, not the endpoint's. The server reads the pad, its record and, when the bank is **solo**, the records on its
sibling pads in one transaction. Solo has one meaning for every kind: pressing one *on* turns its
siblings off — a layer sibling narrowed on the pressed heads, a live cue sibling stopped, and a cue
press taking its layer siblings off wholesale, because a cue has no targets to narrow by. An **off**
press releases nothing, and a stacking bank has no siblings at all. The request carries the
selection's **`families`** beside its targets — the desk's pair while this tab follows the desk,
the tab's own when unlinked — and the response answers `skippedFamilies`; see §The desk selection
has a mask for what lands under it and why a press is never pre-refused here. The band's label row
carries the family pill and the desk chip for the same pair.

**`src/lib/buskLayout.ts` is the document model**: no React, no store, every gesture a plain call a
unit test can make. Three rules run through it:

- **Addresses, not ids.** A pad, bank or column created by the *previous* gesture has no id yet —
  the layout PUT mints it — so drag ids and every position are index tuples (`bpad:{r}.{c}.{b}.{p}`,
  `bbody:`, `bbank:`, `bunder:`, `bgut:`, `bnewrow`, `palette:`). Ids are read in **one** place,
  `toLayoutRequest`, at commit. React keys are `uuid ?? localKey` for the same reason, and a **row's
  key is its first column's uuid** — a row has no identity on either side of the wire, and an index
  key over a list that gets rows spliced out of the middle is the classic remount bug.
- **Normalise inside every mutator.** The server refuses an empty row or column
  (`BUSK_LAYOUT_INVALID`), so `normalisePage` is not cosmetic — forget it and the gesture 400s. It
  drops an empty column and the row left empty with it, and **keeps an empty bank**. That asymmetry
  is deliberate: pruning a bank would delete the one the operator just made, the instant they
  crossed the last pad off it.
- **Null means nothing would change**, which is what lets a repeat hover write no state.

`applyDrop` runs **once, on drop**, in the order **lift → insert → prune**; object identity carries
the destination across the lift, so a bank leaving the column it is being dropped beside cannot
renumber its own target.

**A pad target is an insertion point, not a destination index** — it names the gap the dashed slot is
drawn in, counted over the document as it stands with the source still in it and ghosted. Both halves
must agree on that, or a pad lands somewhere other than where the operator was shown it would:
`resolveDropTarget` produces the gap, `BuskBank` draws the slot at it, and `applyDrop` has to put the
pad in *that* gap — which means subtracting one when the lifted pad sat before it, since removing it
shifts every later gap down. Reading the index as an `arrayMove` destination instead made every
**downward** drag within a bank overshoot by exactly one place, invisibly, because each half was
self-consistent and only the composition was wrong. `buskDnd.test.ts` composes the two and asserts
the slot and the landing place agree; testing either half alone passes with the bug in.

**There is one *app-wide* `DndContext`**, in `components/dnd/DeskDndProvider.tsx` (it was
`CueSlotDndProvider`; it is not about cue slots). `Layout.tsx` mounts it around **both** the FX
cue-slot overlay and the routed page, and the busk page joins it with `useDndMonitor` rather than
nesting one.

Three surfaces do nest one of their own, and the line between them and the busk page is whether the
drag has to *cross* into the shell's droppables: the show's cue cards (`StackDetail`), the stack
list (`ShowOverview`) and the cue sheet's row drag (`SheetTable`'s `rowDrag`, mounted only for a
sheet that asked for it) each reorder a list **within themselves**, and none of them has a gesture
that ends on a cue slot. A nested context wins for its subtree, which is exactly why the busk page
must not have one: it would hide that page from the overlay's droppables, which is exactly the drop
the plan's session 3 needs. The overlay and the busk page coexist by
**mutual ignorance of ids and of foreign *targets***: `parseBuskDragId` answers null for a `slot-…`
id, and the slot handler returns for any `over` that is not a slot. It is **not** ignorance of
*sources* — a drop onto a slot is resolved in the provider whatever lifted it, today a sibling slot
or a `busk-palette` row from the library palette, because the provider owns the slot droppables
(mounted on every route), `projectId` and both slot mutations, while the panel body unmounts with
the overlay. The source→assignment mapping is pure in `components/dnd/slotDrop.ts`, imported
type-only, so the shell still reaches no busk runtime code. Three things about that provider are
load-bearing:

- **Collision detection is `pointerWithin` falling back to `closestCenter`.** dnd-kit's default
  `rectIntersection` compares the *dragged* rect by area, so a 20px column gutter could never beat
  the 300px column beside it, and it answers nothing at all in the gaps between banks.
- **`MeasuringStrategy.Always`**, because the page changes its own geometry mid-drag.
- **One `DragOverlay`, content dispatched** through `dnd/dragOverlayRegistry.ts`. A second overlay is
  not an option — it registers itself on the context and two would fight over one ref. A surface
  registers a renderer at **module scope**, so the app shell draws a busk pad without its import
  graph ever reaching one. The ghost face is a **frozen snapshot**: an effect template's detail line
  reads a live speed-master label through a hook, and the overlay must be hookless.

**The FX cue-slot overlay is filled from the busk view's palette, and edited only while the busk
view is.** A slot holds a cue or a **Look with no deferred effect** — `itemType` is `'cue' | 'look'`,
and the cue-*stack* arm is gone. It has no selection, so it can hold only what needs none: a Look
tile presses `POST /looks/{id}/toggle` with an **empty target list**, and the desk derives the
targets from the Look's own patched fixtures. Three rules follow, and each has a reason that is easy
to undo by accident:

- **A Look tile lights from the programmer's applied feed, never from cue liveness.**
  `lookIsApplied` (`busking/lookPresence.ts`) is a selection-*independent* helper for exactly this:
  the target-scoped folds beside it answer `'none'` for an empty target list by design, so reading a
  slot through one would leave every Look tile dark. It matches on the source being a **LOOK**,
  because a template layer can carry the same int PK.
- **Crosses, drags and drop targets follow `useBuskEditMode()`**, the `buskEdit` Redux slice — the
  overlay is a *sibling* of the routed page in `Layout.tsx`, so a context inside the busk view could
  never reach it. The panel's own long-press wiggle mode and its inline assign panel are deleted.
  Outside edit mode the overlay is press-only, with its *View* / *Clear slot* context menu intact.
- **`slotEligible` is decided at the palette and re-checked in `slotDrop.ts`.** An ineligible row
  dims and says *needs a selection* while a slot is the target (`useCueSlotHover`, a `useDndMonitor`
  rather than provider state, so only the palette re-renders at hover rate), and the drop is a no-op
  if it lands anyway.

Known gap: the slot droppables live inside `CollapsiblePanel`, so with the overlay shut a palette
row dropped at the header lands on nothing, silently — `FU-SLOT-DROP-OVERLAY-HIDDEN` in lighting7's
follow-ups.

**The preview is a ghosted source plus one dashed slot, and there is no `SortableContext` anywhere
on this page.** The primary gesture is a *palette* drop, and a palette row is not a member of any
sortable list, so the dashed placeholder has to be hand-drawn regardless; the three bank zones are
not list indices; and the committed artefact is the whole document anyway. Two rules stop the
classic placeholder oscillation: the dashed slot is **`pointer-events: none` and is not a
droppable**, so it can never be the thing you are over, and the reducer answers null for a repeat
hover. The cost is honest — pads snap around the slot rather than sliding. If that ever reads badly,
`view-transition-name` is the additive fix; do not reach back for `SortableContext`.

**Legal targets follow the source, and the hover is fed from `onDragMove`.** Six things went wrong
at once the first time a bank was dragged on a real desk, and each is now stated in code rather than
assumed:

- **A bank lands on the three bank zones and nothing else; a pad or palette row lands on a pad or a
  bank body and nothing else.** `canLand` in `buskDnd.ts` filters the collisions *before* the
  deepest-wins pick, and the pad and body droppables are `disabled` while a bank is lifted (the
  strips, gutters and new-row zone were already disabled otherwise). Both halves are needed: the
  filter is the half a test can reach, the `disabled` flag is what keeps dnd-kit's `over` — and so
  `isOver` — off a place the drop would refuse. Before this, a bank over a pad resolved to a pad
  target, opened a dashed slot inside the bank, and dropped nowhere: `dropBank` refuses a pad target,
  so the monitor returned before `commit` and no request was sent.
- **The `closestCenter` fallback returns one collision.** `closestCenter` answers with every
  droppable nearest-first; a deepest-wins reader then took a pad three banks away while `over` lit the
  nearest strip. `DeskDndProvider` slices it to one, so the highlight and the slot always name the
  same place.
- **`onDragOver` fires only when the over-id changes**, so the leading/trailing half-of-a-pad decision
  was made on entry and never again. `BuskEditProvider` feeds `resolveDropTarget` from `onDragMove`
  as well; `sameTarget` keeps the state write to the moves that change the answer.
- **`MeasuringStrategy.Always` is not a timer.** dnd-kit re-measures when the set of droppables
  changes or a droppable's own ResizeObserver fires — not when the slot opens and shifts every later
  pad without resizing it. The provider calls `useDndContext().measureDroppableContainers()` in an
  effect keyed on the target, after the commit that moved the slot.
- **With fresh rects the open slot needs to be sticky.** Opening it shifts the hovered pad along and
  leaves the pointer on the slot — which is no droppable — inside the bank body; collapsing that to
  the body's append would throw the slot to the end of the bank the instant it opened.
  `resolveDropTarget` takes `current` and keeps it while the pointer is in the body of the bank the
  slot is open in. Entering another bank's body still appends, which is the only way into an empty one.
- **The drop reads a ref.** `targetRef` is written in the same handler as the state, so a drop that
  lands before the re-render following the last hover cannot read the target before that one.

**`newBank` requires a name.** The server refuses a blank one (`BUSK_LAYOUT_INVALID`), and a
default of `''` was how `+ Bank` and `+ Row` shipped never having succeeded once — the optimistic
patch drew the bank, the PUT 400'd, the queue rolled back and toasted "A bank at row 1, column 5 has
a blank name". `nextBankName` mints `Bank N` for the smallest free N, the vocabulary
`lib/buskAdd.ts` already used to *label* a nameless bank; `BankNameField` reverts a blank rename
rather than sending it. `buskLayout.test.ts` "mints documents the server would accept" now asserts
the name, which is the assertion that was missing.

**Every gesture saves the whole page, and the queue holds operations rather than documents.**
`useBuskLayoutCommit` in `store/busk.ts` enqueues `(page) => page` so each gesture can be *replayed*
against the freshest confirmed document at send time. A queue of pre-computed documents could not:
gesture 2's document was built before gesture 1's response existed, so it would name none of the ids
that response minted and the server would recreate every pad it touched. The response is written
into the cache **only when the queue drains** — an intermediate one describes the world a gesture
ago, and writing it is exactly the snap-back the queue exists to avoid. On failure the queue is
dropped, the last confirmed page restored, **and the page re-read**: the write may have been refused
because a record behind one of its pads was deleted, and that is the one frame the echo suppression
below can swallow.

Patching from the **response** rather than optimistically-then-invalidating is a deliberate
departure from `reorderTemplates`: that route answers `void`, so a refetch is its only way to learn
what happened; this one answers the page as written, ids included.

**`busk.layoutChanged {pageIds}` is keyed, and the bridge suppresses our own echo.** The frame fires
for page CRUD, reorder, every layout write **including this client's**, and a record delete that took
pads off a page; a page delete carries the deleted id *plus every survivor*, since their `sortOrder`
moved. Invalidation is per page (`{type:'BuskPage', id: 'page-N'}` — prefixed, because the project
id shares that tag type), so **a page id from another project matches nothing and is a silent
no-op**: the frame needs no project lookup. A single-page frame is dropped while that page is saving
or within a short grace after its response, because our own write would otherwise refetch once per
gesture and could land between an optimistic patch and its own response. One page is the tell — a
layout write announces exactly one, page CRUD and reorder announce several.

**The desk holds a showing page, and a window chooses whether to be on it.** `busk.pageState` /
`busk.setPage` (`api/buskPageApi.ts`, `store/busk.ts`'s `buskShowingPage` entry) stays server-owned,
for the reason it always was: a hardware *next page* button and a tab click are two ways of making
one gesture, so the surface needs one thing to move — `BuskPageNext` / `BuskPagePrev` /
`BuskPageSet` write `BuskPageState` and every *following* window moves with them. What that argument
never established is that **every** window must be pinned to it, and on two screens it is wrong: the
flow this exists for is a colour page on one screen and a position page on the other, pressed onto
one selection. Reported on the desk 2026-09-16.

So the page gets a **follow/local split of its own**, `lib/buskPageFollow.ts`, on `lib/deskFollow.ts`'s
model — per-tab `sessionStorage` (two desk screens are two windows of one profile), default follow,
unlinking snapshots what the window is showing and leaves the desk's alone, re-linking adopts the
desk's and publishes nothing. The order is **this window's own page (unlinked) or the desk's
(following) > `?page=` > the first page**, all resolved against the fetched list so a stale bookmark
lands somewhere real; a tab click writes the **desk** while following and this window's copy once
unlinked, and the URL mirrors whichever won with `replace` — flipping pages is not a history entry.
A `null` from the desk is *not* "the first page": it means nothing has moved it, and each client
falls back on its own.

**Two flags, two chips, and neither may drive the other.** A single flag cannot express the flow:
following would pin both screens to one page, and unlinking to get two pages would take the shared
selection with it, so the operator would select twice. `DeskChip` in the band's label row governs the
selection, `BuskPageChip` beside the page tabs governs the page — the same pill, the same link /
unlink glyph, and on this view both name their subject (*Targets:* / *Page:*) so neither reads as
governing the whole view. On the programmer's row C the selection chip is alone and stays bare; there
is **no page chip there**. A window that has unlinked its page has not unlinked its selection and
still presses onto the desk's targets and mask.

**The flag is tri-state, and `?page=` is what the third state is for.** Arriving with a `?page=`
**that resolves against the fetched list** is an explicit statement about *this* window — it composes
with the Screens sheet's launcher, so `?window=Screen%202&page=3` starts a second screen where you
want it — so it **unlinks** the window onto that page. An arrival naming no page, or one that is
gone, records that the window *follows* instead; both arms write the flag, which is what makes a
reload never an arrival. It has to be once per tab: the view mirrors the showing page back into
`?page=` on every change, so a following window reloading would otherwise read its own mirror as a
deliberate statement and unlink on every refresh. `null` means *this tab has not decided yet*, and
it is the only thing that tells a fresh window from a reloaded one — so there is deliberately no
second, in-memory "already ran" flag beside it. The parameter is latched at mount as the **raw
string**, null when absent, because `Number(null)` is 0 and a page whose id were 0 would make every
plain `/busk` load read as an arrival.

**Two consequences of that, both surprising enough to be worth saying out loud.** The busk view's own
address always carries `?page=`, so **a copied URL opened in a fresh window arrives local, not
following** — one click on the chip joins it to the desk, but nothing does it for you. And **there is
no separate offline override any more**: it was a second thing meaning "this tab's page", so a click
that never left the browser (`setShowingBuskPage` returns `sendGesture`'s `false` when the socket is
down) now unlinks the window onto the page clicked. That loses the old override's self-healing — it
was cleared by any change to the desk's value, so a Wi-Fi blip mended itself — and the trade is
deliberate: one mechanism rather than two, and a state that *says* what it is on the chip instead of
a silent override. A window stuck local after a blip is one click from following again.

**The mirror waits for the arrival decision to be rendered.** Both effects run in one commit, in that
order, and `unlinkBuskPage` only *schedules* the re-render that moves the active page — so an
ungated mirror writes the page the window is unlinking *from* into the URL and corrects it a tick
later. `useBuskPageDecided` is the **rendered** tri-state, and lagging by one render is exactly what
makes it the right gate: a live `isBuskPageDecided()` has already been flipped by the arrival effect
beside it, and `useBuskPageFollow()` collapses `null` and `true` to one `true` and so never changes
in the keep-following arm.

It shares only a namespace with `busk.layoutChanged`, which names pages whose *document* changed and
is what the echo suppression is written against; a local page still needs that invalidation like any
other. Edit mode
lives in `store/buskEditSlice.ts` rather than a React context, because the cue-slot overlay is a
*sibling* of the routed page in `Layout.tsx` and could never read a context provided inside the busk
view. It is never persisted, and `BuskingView` **must** exit it on unmount, or that overlay keeps
drawing crosses on whatever page the operator went to next.

**The columns of a row stack below 600px of the page body's width, and editing is desktop-only.**
`PageRow` hands its twelfths → `fr` tracks to the grid through a CSS variable so a container query
(`@max-[600px]:grid-cols-1`, on `BuskPageBody`'s `@container`) can override them — an inline
`grid-template-columns` could be overridden by nothing. It is the body's width and not the
viewport's because the rail or the palette has already taken its share: at `md` the body is ~480px
beside the rail and ~408px beside the palette, and four quarter-columns need ~600px before each can
hold one 110px pad. Edit mode stacks too, with a gutter drawn as a strip between two stacked columns
(still "the new column before column N"). Below `md` the palette is not shown and *Edit layout* is
hidden with it — by decision, narrow widths get play mode only, and an edit mode with nothing to
drag from is a trap. `Done` stays at every width so a window narrowed mid-edit can leave.

### The hand

**The desk holds one record between two screens.** A template, a Look or a cue is *picked up* on
any window and *placed* on any other — the cross-window move, deliberately instead of a pointer
drag, because the window that saw the press keeps the pointer for the whole gesture and the
neighbour never receives a pointer event of its own. Backend contract in `lighting7`'s
`state/HandState.kt` and `plugins/HandSocket.kt` (17140b3), the wire in
`docs/websocket-engineering.md` §Hand; the plan is
`lighting7/docs/plans/completed/multi-screen-plan.md` §3.5 and D12, and where
that plan's sketch and the shipped commit differ, **the commit wins**.

**Three frames, and none of them places.** `hand.state {item?}` is the connect snapshot and the
broadcast; `hand.pickUp {kind, id}` resolves the record **in the current project and nowhere else**;
`hand.drop {uuid?}` lets go. There is no `hand.place` and **you must not add one** — every target
already has a mutation with its own validation, so one frame that placed would reimplement four of
them behind a single name. **A place is the placing window's own mutation followed by `hand.drop`**,
and Undo is that window's inverse mutation, offered for ten seconds (`HAND_UNDO_MS`).

**A drop after a place names what it is dropping; the chip's × and Escape do not.** A place is two
independent round-trips — the window's mutation, then the drop — and another window may have picked
something up in the gap, so a bare `hand.drop` would clear an item this window never touched, on
exactly the two-screen case the hand exists for. `useHandPlace` in `store/hand.ts` is the one owner
of that sequence and sends `hand.drop {uuid}`; `handDrop()` beside it is the bare form and is what
the × and Escape call, because "let go of whatever is there" is precisely what those two mean.
Getting it backwards is **invisible in one window**, which is why `hand.test.ts` asserts the uuid
rather than the call — a test that accepted a bare drop would pass with the bug in. A failed
mutation drops nothing and toasts nothing: the operator still has the item, and
`errorToastMiddleware` has already reported the refusal.

**Every hold carries a server-stamped `holdId`**, monotonic, which is the identity of *this* hold
rather than of the record. It exists because `MutableStateFlow` conflates by `equals` and two
pick-ups in one clock tick would otherwise be indistinguishable. On this side it is the chip's React
`key` and the `data-hold-id` it draws: two hands of one record differ in nothing else, so without it
neither a test nor a later session can tell "still holding" from "picked the same thing up again".

**`store/hand.ts` is form 3** (`onCacheEntryAdded`), not the form 1 the plan's bullet names, and
`store/windows.ts` is the precedent that settles it in two steps. `HandChip` mounts in `Layout.tsx`,
so the module is on the **earliest render path** — the case §"Where a WS bridge subscribes" reserves
for form 2, where a module-scope `lightingApi.hand.subscribe(…)` can throw a TDZ `ReferenceError`
that `tsc`, `vite build` and the tests all miss. And `hand.state` is a **stream** carrying the whole
item with nothing to refetch, so there is no invalidation for a bridge to dispatch; a `queryFn` that
closes over `lightingApi` touches it only when the first reader mounts and needs no
`startHandBridge()`. There is also **no `open` branch**, and that is `selectionApi`'s rule rather
than `windowsApi`'s: the desk pushes the snapshot on every connect, and a write on connect would be
this window silently changing the desk's hand.

**The ghost is frozen and hookless.** The frame carries the record's **own summary DTOs**, exactly
as `BuskPadDto` does, so `HandChip` builds its face through `padFaceOf` and subscribes to *nothing
about the held item* — `dragOverlayRegistry`'s rule, for its reason: an effect template's detail line
reads a live speed-master label through a hook, and a chip that can sit on screen for five minutes
across every route must not mount one per hold. The cost is `FU-DTO-RECORD-SUMMARY` in lighting7:
the embedded `usage` and `buskPageCount` were computed at pick-up, so a long hold can read "on 3
pages" after a fourth was added. Intended — a pad's face is frozen between reads too — but **do not
build anything that presents those two fields as live**.

**Escape is the last rung, and the question is asked in the capture phase.** `HandChip` drops only
when nothing else claims the key: a cell editor open anywhere (`cellEditorIsOpen()`), any
`[role="dialog"]` or Radix popper on the page, or an event already `defaultPrevented`. That is
§"The cell editor's three forms"' snapshot rule — *is an editor open*, not *where was the key
pressed*, which `isEditableTarget` and `closest('[role="dialog"]')` answer and answer wrongly the
moment focus leaves the panel. Radix listens on the **document** and closes first, so a bubble-phase
read always says "nothing open"; a **window capture** listener is the first thing any keydown
reaches, and the bubble handler reads what it recorded for that same press. Get it wrong and Escape
in a cue-name field silently drops the operator's held item.

**The timing is `useEscapeEditorSnapshot`'s, shared — only the predicate differs.** That hook takes
an optional `extra` and the chip passes `anyOverlayOpen`; the hand's ladder is longer than the
grid's, but the capture/bubble trick is delicate enough that a second copy of it is how one of the
two silently stops working. The overlay half is a **document-wide** query, never an ancestor walk,
for the same reason the rule is stated the way it is.

**`lib/handTargets.ts` is the one eligibility table.** A bank takes all three kinds (a pad *is* a
reference to one of them); a slot takes a cue or a Look with no deferred effect (it has no
selection, D7); both layer stacks take a Look or a template. So a cue lands only on a bank or a
slot, which falls out of the table rather than being stated a fifth time. It is eligibility and
never permission: every place still runs its own mutation.

**`canHandLand(…, 'slot')` is also what `LibraryPalette` sets each row's `slotEligible` from**, and
that sharing is the fix for a real hole rather than tidiness. The rule used to be written out four
times — three per-kind literals in the palette, `canHandLand`, and the test's own fixture — and
`slotAssignmentFor` re-checks only the *template* refusal, so the deferred-effect-Look half rested
on the flag alone. A test that built the flag from its own copy of the formula and then asserted the
two agreed was comparing two hardcoded copies of one rule: genuine drift in the palette would have
stayed green. With one statement of it that drift is gone by construction, so `handTargets.test.ts`
pins what is *still* two independent pieces of code — `slotAssignmentFor`'s kind re-check, fed a
deliberately wrong `slotEligible`, asserting both that it catches a template and that it does **not**
catch a deferred Look. `slotDrop.ts`'s docblock states that asymmetry; the sentence that stood there
before implied it covered both.

**The rings are buttons, not `useDroppable` sites**, which is a deliberate departure from the plan's
sketch. A hand place is a **tap** — the whole point of the hand is that no drag is in flight — so a
droppable could never be dropped on in this session, while being registered on the app's *one*
`DndContext` for every busk-page and surface drag that is; `DeskDndProvider`'s `closestCenter`
fallback returns one collision in the gaps between banks, and a foreign candidate there is exactly
the "highlight in one place, slot in another" failure §"The busk layout" is written about. Session
4's `elementsFromPoint` hit-test would not have been helped by one either — dnd-kit gives no way
back from a DOM element to a droppable — so **`data-hand-target` is the registration** both sessions
read. The affordance is explicit (`HandPlaceStrip`: a *Place “X” here* band, rendering null otherwise)
rather than a temporary second meaning for a surface's existing press, because a mode is state an
operator forgets.

**It is offered in *Edit layout* too, and draws solid there** (`amongDropTargets`). Both busk
targets withheld it while editing at first, and that was wrong in a way worth recording because the
reasoning sounded right: dashed means "a drag lands here" on that page, and this band is a button no
drag can land on — which is an argument about how it is *drawn*. Turning it into a refusal removed
the gesture in exactly the case the hand exists for, a record picked up on **another** window, which
this window's palette cannot stand in for. The empty cue slot made it plainer still: an empty tile is
not draggable and its click does nothing at all while editing, so the gate prevented no collision and
cost the place. Reported as confusing by Chris on the desk, 2026-09-16.

**`useHandOffer` narrows through `selectFromResult`, and the two layer strips are each split in
two.** This hook runs once per bank and *unconditionally* in every `CueSlotCell` — hooks cannot be
conditional, so the filled-slot path pays for it too — and a plain subscription woke all of them on
every `hand.state` frame desk-wide, including the usual case where their own answer was null before
and after. `useIsDeskConnected` is the same move for the same reason. The strips are split because
`useDeskSelection` is a second standing subscription: the outer component asks the narrowed offer
and renders nothing when the hand holds nothing it can take, so the selection is subscribed to only
while a placeable record is held. Flat, the programmer's strip re-rendered on every marquee that
crossed a row boundary — it sits in the rail footer on every visit to `/programmer` — and the cue
strip multiplied that by however many cue cards are expanded.

**A place that never left the browser is not a place.** `programmer.addLayer` is fire-and-forget, so
"it landed" can only ever mean "it was sent" — but *was it sent* has a real answer: `sendGesture`
refuses a closed socket, toasts "that did not reach the rig", and returns false. `addLayer` and
`programmerAddLayer` now return that boolean, and the programmer strip's `run` answers `null` on
false so `useHandPlace` keeps the record held and stays quiet. Returning `true` regardless — which
is how it was first written — dropped the hand and toasted success **beside** that error toast, on
the one place with no Undo to recover through.

**The four places, and the three Undos.** A **bank** is `useAddBuskPadMutation` — it answers the
whole page, so the busk view's commit queue needs nothing — and its inverse goes back through the
layout PUT, since there is no remove-pad route: `lastPadOfBank` finds the appended pad in the page
the append returned. A **cue slot** is `useAssignCueSlotMutation`, on **empty tiles only** — a filled tile's press is
live, and a hand held over the panel must not quietly become a second meaning for it; replacing an
occupied slot is *Clear slot* and then this. A **cue's stack** is `patchProjectCue`
through `buildCueInput`, appended at the top (later wins within a cue), and its inverse patches back
the layers array read *before* the place. The **programmer's layer stack** is `programmerAddLayer`
and has **no Undo**, which is a decision: that op is fire-and-forget and returns no id, the only way
to find the new layer would be to diff a stack that is *shared*, and a wrong inverse removing another
window's layer on a live rig is worse than none — the row it just added is one click from its own
remove. Both layer places send the **desk selection** as `targets`, which *supplies* them for a
template and *filters* them for a Look, and the family mask is the server's.

**Five doors pick something up.** A busk pad's hold now opens a **menu** — *Pick up* first, *View*
second — where it used to navigate straight to the library, because the hand needed a door there and
a hold cannot mean two things (`CueSlotCell` does the same synthetic-`contextmenu` trick, which
leaves right-click working on a mouse for free). The `/looks` and `/templates` rows carry it at the
top of their row menus, above the edit verbs and only for the project the desk is on — the hand is
project-scoped server-side, so a pick-up from another project's library resolves nothing.
`LookStack`'s dense row popover picks up the layer's **referent** and leaves the layer alone; it is
not a `LayerHandlers` member, because those seven are index-based to address *this host's* layer
while a pick-up names a library record the row already carries. And the programmer's template chip
offers it on **right-click only**: the chip's hold is already ⌥click's touch twin (§"The two apply
gestures"), so on touch the routes are the library row and a pad's hold menu, both of which have a
free hold.

**That chip is a `Popover` opened from `onContextMenu`, and must not become a `ContextMenu`.**
Radix's `ContextMenuTrigger` arms a long-press timer of its **own** (~700ms) for `touch`/`pen`,
cleared only by its own pointer handlers or by a `contextmenu` reaching the trigger. The pad and the
cue-slot tile are safe because their holds *dispatch* a synthetic `contextmenu`
(`dispatchSyntheticContextMenu`, shared by both — clearing that timer is what it is for, not just
reaching the menu on touch). The chip dispatches nothing: its hold fires a tracking-layer mutation.
So a stationary touch hold on it added the layer at 500ms and popped the pick-up menu at 700ms —
two effects from one finger, on a live rig, with the primitive breaking the rule the code had
written down. `PopoverAnchor` registers no handlers at all.

**MIDI has three doors of its own** — `pickUpPad(padUuid)`, `handPlaceInBank(bankUuid)` and
`handDrop`, all BUTTON, mirrored in `lib/surfaceDrop.ts` as §The MIDI surface view requires. There is
no `handPlaceInSlot` and no layer-stack place: neither a cue slot nor the programmer's stack has a
uuid a binding could carry. `handPlaceInBank` brought a new health variant, **`missingBank`** — a
*busk* bank, never the device profile's `unknownBank`, which shares only the word — and closing that
arm in `healthDescriptor.ts` was one of two gaps the backend's review found here. The other was
`describeTarget`'s missing `default`: `noImplicitReturns` is off, so an unknown discriminator
returned `undefined` and drew a **blank** label rather than falling through, which reads as a bug in
the panel. Its three siblings already answered properly. The library offers `handPlaceInBank` as one
chip per **bank** and `handDrop` on the Desk row; `pickUpPad` is in the picker only, because a
`Pick up` chip would sit beside the `pressPad` chip for the same pad under the same name.

**A record can also be *dragged* between two screens of one browser, and that gesture ends in the
hand rather than going around it.** Drag a library palette row off the right (or left) edge of one
window and it arrives on the window beyond that edge, under the pointer. The difficulty is the one
the hand exists for: the OS delivers a held button's moves to the window that saw the press, so the
neighbour never receives a pointer event of its own. So the drag is cut in two at the boundary —
`DeskDndProvider` hands the record into the hand (`hand.pickUp`), cancels its own drag, and posts
only the **release point** on a `BroadcastChannel('desk-drag')`; whichever window is under that
point claims it by hit-testing itself. `components/dnd/edgeDrag.ts` is the rule (bounds test,
screen→client, `data-hand-target` hit test, the message) and `useEdgeDrag.ts` the wiring. Seven
things about it:

- **A release no window claims is not an error.** The record is simply still in the hand, every lit
  band is still lit, and nothing is toasted. That is the whole reason the hand-off is a pick-up and
  not a transfer — and it is why the receiving half may never drop the hand on a miss.
- **It is gated on `BroadcastChannel` and on nothing else.** The plan asked for
  `'getScreenDetails' in window` plus a granted `window-management` permission; that is stricter
  than the APIs the gesture uses, so the gate is not built. The bounds test reads
  `screenX / screenY / outerWidth / outerHeight` and the pointer's own `screenX / screenY`, all six
  of which have always reported virtual-desktop coordinates and none of which is permissioned;
  `getScreenDetails` only *enumerates* the other screens, which nothing here needs because the
  channel is a broadcast and the neighbour claims by hit-testing rather than by being addressed.
  Where `BroadcastChannel` is missing the gesture is quiet (D13) and the hand is the route — as it
  is to the iPad, which this channel deliberately never reaches.
- **A presence handshake arms it, and without that it is a regression rather than a feature.** The
  bounds test alone cannot tell *the pointer crossed onto the next screen* from *the pointer
  overshot the edge of a windowed browser with nothing beside it* — and the horizontal chrome offset
  is 0 on every current desktop browser, so a window's outer edge **is** its visible content edge and
  an ordinary drag toward a cue slot overshoots it easily. So windows say `hello` / `here` over the
  same channel and the hand-off arms **only while another window is actually listening**. The probe
  is made **at the boundary, not at drag start**, so a drag that never leaves this window puts
  nothing on the channel at all and is exactly what it was before this session; a first crossing
  that finds presence stale probes and waits one frame for the answer. The same gate is what
  makes the channel's real reach safe: it is one browser instance and profile, so a Chrome window
  beside a Safari one, two profiles, or `localhost` beside the LAN name never hear each other — and
  each of those now gives an ordinary in-window drag rather than one that silently vanishes.
- **One `BroadcastChannel` object per page**, which is why both halves hang off `DeskDndProvider`.
  A channel delivers to every other object of its name *including ones in the same page*, and never
  to the object that posted — so a second object here would make the sending window hit-test its own
  release, place the record on itself, and the gesture would never leave the screen.
- **A posted release becomes a place by synthesising a click** on the hit element.
  `HandPlaceStrip` is already a `<button>` whose `onClick` runs the right mutation with the right
  *where* string and the right Undo, and `useHandOffer` has already refused anything ineligible; the
  empty cue-slot tile is the same shape. A click reuses all of it and states no rule twice, where an
  element→callback registry would be a second copy of what the button already is. Two properties
  come free: a `disabled` tile dispatches no click at all, and a target scrolled out of view is at
  no point. `dispatchSyntheticContextMenu` is the codebase's precedent for the move.
- **The cancel is a synthetic `pointercancel`, never a synthetic Escape.** dnd-kit has no
  programmatic cancel, but its `PointerSensor` binds `pointercancel` on the owner document to the
  very same `handleCancel` as its Escape handler — so this cancels as surely and leaves the keyboard
  alone. An Escape would sit in front of `HandChip`'s Escape ladder and every other document-level
  Escape listener on the page, and keeping it harmless rested on marking it `defaultPrevented`
  before anything else read it: true of the window *node*, but not guaranteed of listener *order* at
  that node. Saying "the pointer was cancelled" is also simply true, where "the operator pressed
  Escape" was a pretence. It runs through the provider's existing `onDragCancel` — the one that
  clears `isDragging` and so keeps the cue-slot panel body mounted — and `handleDragEnd` returns
  early for a handed-off gesture besides, so the cancel is not load-bearing: a dnd-kit that ever
  declined it could not also resolve the drop.
- **The pointer's screen position is read off a window `pointermove`, never reconstructed** from
  dnd-kit's `delta` and activator event, which goes wrong under browser zoom and a non-1
  `devicePixelRatio` — the desk's likely setup. The listeners are attached **imperatively at arm
  time** rather than by an effect, because an effect attaches a commit later and a fast flick can
  cross the boundary inside it; and they **outlive the drag**, because the hand-off *is* a cancel and
  the release they exist for has not happened yet, so the teardown is the pointer's. They refuse
  three things, each a real way to get this wrong: an event from a **different `pointerId`** (a
  second finger must not move or end the first one's drag), **our own cancel** (a flag held across
  the synchronous dispatch, since it would otherwise read as the release and post from the boundary),
  and a **second pick-up after a refused one** (a pick-up that never left the browser leaves the drag
  alone, and without this every later move would try again at up to 120Hz — one attempt per
  crossing, come back inside to retry).
- **A release names its record, and the receiver waits for the hand to hold it.** The channel is
  local and instant while the hand arrives over the WebSocket, so a release can outrun its own
  `hand.state` frame — the receiver would find no band rendered yet, or, if something else was
  already in the hand, find *that* record's band and place the wrong record. `whenHandHolds` is the
  wait — **and the question is asked once more in the instant before the click**, because the hand is
  shared and can move again while this window polls and settles, and the band is the same DOM node
  across renders, so React swaps its `onClick` closure in place: clicking the element found a moment
  ago would place whatever is held *now*, under a band that still looks eligible because it is. A
  release places the record it names or nothing at all. A target that never appears is a release
  nobody claims.
- **There is no arbitration between two claimants, and overlapping windows place twice.** A claim
  message with a lowest-id tie-break was built for that and removed again, which is worth recording
  because the reasoning is the general one. It **cannot happen on this desk**: the release is one
  point in virtual-desktop space, so both windows would have to contain it, and two windows tiled on
  two monitors never overlap — it needs windows stacked on one screen. It was a **mitigation, not a
  guarantee**: a claimant can only wait so long before clicking, so two windows whose target
  discovery differed by more than that settle window both placed anyway — exactly the timing skew
  (differing render latency, differing `hand.state` arrival) the case is about. And it was the
  source of a real double-place bug of its own. Both places are ordinary mutations the operator sees
  toasts for, and the bank place carries Undo. If it ever matters, the fix is arbitration that
  **waits for an acknowledgement** rather than for a timeout — not the tie-break that was here.
- **A palette row, and only a palette row.** A `busk-pad` drag carries a `PadFace` and a position
  and a `slot-item` drag a slot address; neither names a record id, so neither can be handed off
  without widening the busk page's own drag contract. `screenToClient` is an honest heuristic
  (`outerHeight - innerHeight` of chrome, all at the top; half of any side border), exact on
  Chrome and Edge on Windows and affordable against 28px bands, and **unmeasured on Safari**, where
  it fails safe — a point a few pixels out misses the band and the record stays in the hand. If it
  ever reads wrong the fix is to cache `event.screenX - event.clientX` from a real pointer event,
  not to reach for `getScreenDetails`. `handTargetAt` takes the **topmost** hit and walks up from
  it, never down the stack: a band behind an open dialog is still mounted, and burrowing past the
  overlay would place a record on a target the operator cannot see.

There is **no ghost following the posted point**, by decision: the receiving window's `HandChip` and
every eligible band already draw the moment the hand fills, so a following ghost is new UI over an
affordance that is already there. If it is wanted, it is a `move` message plus a **frozen, hookless**
snapshot, for `dragOverlayRegistry`'s stated reason.

### The MIDI surface view

`/projects/:id/settings/surfaces` draws the attached desk as **a picture built from profile data**
(`ControlSurfaceType.layout`), labels every control by re-deriving the backend's own resolution
rules, and — under *Edit bindings* — lets a library be dragged onto it: **a row lands on a strip, a
chip lands on one control**. Read
[`docs/midi-surface-engineering.md`](docs/midi-surface-engineering.md) before touching it; the plan
is `lighting7/docs/plans/completed/midi-surface-plan.md` and the layout authority
`lighting7/docs/plans/completed/midi-surface-design/`.

The four things that bite, in one line each. **`lib/surfaceResolve.ts` is a mirror of
`ControlSurfaceBindingService.resolve` and `deriveStripTarget`** and its failure is silent — a
precedence read backwards paints a plausible label for a control the desk drives differently.
**Droppables sit on the grid-cell wrapper, never inside the memoized `ControlCell`**, or a hover
costs the whole panel at 20 Hz. **A drop patches the control's *own row at the exact bank* or
creates** — `index.byControl.get(id)?.get(activeBank)`, never `resolveControl`, which would answer a
strip's row or a global one and move a binding the operator was not pointing at. And **the
eligibility dim mirrors a backend rule rather than standing alone**: since session 4,
`ControlSurfaceBindingService.refuseWrongKind` refuses a `fireCue` on a fader at the write boundary
whichever door it comes through, and `controlKinds` / `targetControlKind` in `lib/surfaceDrop.ts`
are the client copy of `midi/BindingControlKind.kt`.

**A colour on a continuous control is one of four HSV axes** — hue (the default, and the only one
a pre-axis row can mean), a fine hue trim, saturation, brightness — carried as an optional
`colourAxis` on the four property targets and on the encoder bank; the bundled emitters (white,
amber, UV) are offered as faders of their own, expanded off the colour descriptor's channels in
`hooks/useTargetProperties.ts`. `lib/colourAxis.ts` mirrors `midi/ColourAxis.kt` and owns the
null-is-hue rule; nothing on this side resolves an axis. The library is sectioned by kind with
**Desk first**, and a row's chips are grouped by family with a hairline — see the two sections at
the end of `docs/midi-surface-engineering.md`.

A button can also press a **record**: `applyLook` onto the Look's *own* fixtures, `pressTemplate`
onto the desk selection, `pressPad` through the pad's whole bank plan, plus the three busk-page
targets. Four things follow on this side. Their library rows are **not** `TargetRowItem`s — that
component exists to mount `useTargetProperties` per target — so they are built in `SurfaceLibrary`'s
`rows` memo from `actionChip`. The **kind row stays at six**: a template files under *Looks*, a busk
page under *Desk*, and *Next page* / *Prev page* sit on the Desk row once, because a chip repeated
per page reads as page-specific. A **Look with a deferred effect is offered with no chip**, since it
has no own fixtures and the write boundary refuses it by name. And `describeTarget` **will not
resolve a uuid to a name** — `components/surfaces/recordOptions.ts` is the one owner of that, shared
by the picker and the inspector, the same split `useSpeedMasterDisplay` makes for a speed master.

**One desk, one selection, server-owned** (`store/selection.ts`), and three surfaces move it: the
busk target band, the programmer's fixture list, and a select button on the desk itself. The list
half is `useDeskSelectionBridge`, whose load-bearing rule is that rows publish through
`rowLocateTarget` — never the `programmer` scope's `targetKeys`, which is already flattened to
member keys, so a marquee over *Front wash* would reach the desk as eight loose fixtures with the
group's select LED dark. Edit mode there is **local state**, deliberately not the busk view's Redux
slice: that one exists only because the cue-slot overlay is a sibling of the routed page.

### The two apply gestures

A template has **two** presses, and the difference is invisible on screen — only the route called
says which happened, so both are stated on the chip's title:

- **click** → `POST /templates/{id}/apply`. Sets **literal** values in Local. Retuning the template
  later does not move them; this is the busking gesture, and it is why the retired `ref:` grammar is
  not missed.
- **⌥click, or a hold** → `POST /templates/{id}/toggle`. Adds a layer that **tracks** it, targeted at the
  selection and masked to the template's family — **the server derives the mask** from the
  template's own rows, because which family a template layer belongs to is a fact about the
  template, not about the press. This repo sends its `propertyMask` anyway, as the belief it is
  acting on; the response reports the mask actually applied, so a disagreement surfaces there rather
  than silently on the rig. Retune the template and every layer moves. The layer *is* the dependency
  mechanism — it already was, for Looks — so "a colour I can change everywhere later" and "a colour I
  want right now" are two gestures on one chip rather than two kinds of template.

**The hold is ⌥click's touch twin — `touch` and `pen` only, never a mouse.** It goes through
`useLongPress` on the chip, and it is a hold rather than a Set/Track switch in the bar because ⌥ is
per-press and a mode is state an operator forgets. It is gated on pointer type because a mouse has
⌥: a mouse hold would be a second, silent door to the tracking mutation, and a slow click on a live
rig would add a layer where literals were meant. That is the same gate, and the same list, the
grid's marquee arm makes, and it is the one place the desk's holds differ — a busk pad's mouse hold
opens an inspector, which changes nothing. A hold is otherwise the press's second meaning everywhere
on the desk: a pad's inspects it, a speed card's is its fader, and since the desk-findings' group B
the **grid's is its marquee**: on a touchscreen a finger pans and only a held one marquees
(`touch-action` cannot say that, so `useCellMarquee` arms by time for `touch`/`pen` and refuses
`touchmove` only while a marquee is live). A chip and a cell never share a point, so the hold never
means two things where a finger lands. The other phone rules on that row: below `@[600px]` the bar
is glyph · cell count · chips · New · Deselect (`SelectionBar.tsx`; the toolbar's Deselect serves
rows and cells alike since the two became one selection), and a tap on the grid's empty background
runs the same cells-then-rows ladder Escape does — only on the grid's own DOM, since React bubbles
a click inside a portalled cell editor up the same tree.

`TemplateStrip` lives in `ProgrammerGrid`'s `renderToolbar`, which hands down the marquee's
`cells` **and three things the container derives from them** — so **the selection is the filter and
the target**, and there is no picker to open or family dropdown to get wrong:

- **Cells selected**: only that family is offered, and the press lands on the cells' heads —
  three colour cells means those three fixtures (which, since the two selections became one, are
  also the fixture selection; see §One selection, two shapes).
- **Rows selected, no cells**: the gesture names no attribute, so the filter is what the heads
  *can take* (`targetFamilies`, from descriptors — capability-only, fx-templates D6): a rig of
  dimmer-only pars is offered no colour template, and nothing with a mover on it offers a position
  one. The press lands on the rows.
- **Nothing selected**: the whole library shows, and a press toasts that it has nowhere to land.

**`targetEmitters` narrows it further, in every one of those arms.** A template naming `white`,
`amber` or `uv` is withheld unless some selected head has every emitter it names — the family cannot
draw that line, since the hex and all three emitters are COLOUR. See §Looks, templates and layers
for why it is a union and why the probe reads the colour descriptor rather than a category.

`templateTargetsFor` in `rowModel.ts` is the target rule, and it is neither sibling: a group row
lands on its *visible* members (the filter rule every group-row action keeps), and an element row
lands on its fixture, because the template route resolves keys against the patch and would drop an
element key silently. The strip reads nothing from Redux; `NewTemplateFromSelectionSheet` takes the
same targets so a press and its "new from selection" cannot name different heads.
`TemplateStrip.test.tsx` pins the filter, the target and the click/⌥click split.

One trap on the response: the desk answers a **value** apply with `effectIds: []` as well as
`written`, so the "nothing started" warning is gated on `template.kind === 'effect'`, not on the
field being present — it toasted red on every successful value press before that. Both presses go
through **`useTemplatePress`**, shared by the chip and the picker's pads, so the two surfaces cannot
answer "what does a press do" a chip apart.

**The row is the eight most recently *pressed*, not the library**, and recency is a **desk** fact
rather than a tab's. lighting7 stamps `last_pressed_at_ms` on every press that *applies* a template
— through four doors: the chip's click, ⌥click / hold, a busk pad press, and a MIDI `pressTemplate`
— so every client and the desk's own hardware agree about what was reached for; a toggle **off** is
not a press, and neither is a click that reached no head. It arrives as the keyed frame
`templatePressed { templateId, lastPressedAt }`, which `startTemplatesBridge` **patches** into every
cached `templateList` entry (all `family` args — the filter is a query argument, so the programmer's
unfiltered list and `/templates?family=` are two entries of one endpoint). It must not be folded
into `templateListChanged`: that bridge invalidates `TemplateList`, `Cue` and `CueList`, and a press
happens at busking rate. `lib/templateRecents.ts` is the one place that orders them, and it orders
by **parsing** the stamps: `Instant.toString()` omits the fraction on an exact second, so `…:34Z`
compares *after* `…:34.500Z` as text. With nothing pressed yet the row falls back to the first eight
by name — all or nothing, never one recent padded out by seven, which would move the row's contents
under the operator's hand on the second press.

**`All · n` opens `TemplatePicker`** — the offerable library as a searchable pad grid, sections
Recent · All A–Z · Per fixture · Effects, built from the busk pad's own face (`padFace.ts`'s
`PAD_SHELL` / `templateSwatch` / `padPresenceClass`, and `templateLayerPresence` against the desk's
resolved applied state). Three things about it: it takes **`useCellEditorForm`'s three forms** and
neither of its own media queries, so the picker and a cell editor never disagree about which shape a
screen gets; **a press does not close it**, because auditioning three colours in a row is the normal
case; and its popover width is a **media** query rather than a container one — `PopoverContent` is
portalled to `body`, so row C's `@container` is not an ancestor and a container class there would
match nothing, silently.

**Row C sheds twice on the way down.** Below `@[800px]` the fixture count, its separator and Locate
/ Highlight fold (`MID_FOLDED_CLASS` in `SelectionToolbar.tsx`) — the count is already on the cell
count's hover, and both verbs are on the busk target band — which is what gives an iPad portrait two
recent chips instead of none. Below `@[600px]` the chip scroller is not drawn at all and the library
is reached through `All · n` alone, with Recent as the sheet's first section. The design authority
is `lighting7/docs/plans/programmer-chrome-design/`, page *Templates*.

**New from selection** is server-side (`POST /templates/from-programmer`), for the same reason apply
is: converting a recorded *literal* back into an **intent** is per-head arithmetic that has to agree
with the resolver. It also decides **generic vs per fixture from the data** — one row per property
where every selected head agrees, one row per head where they do not — rather than from a toggle,
because the operator already said which they meant by putting the heads where they are. The
colour inverse is a documented heuristic (fold the emitters back into RGB, policy `extract` when
either was driven); it lives in one place, `templateRecord.kt`.

### The desk selection has a mask

**Every press sends the pair it is acting on — targets and `families` — and the desk decides what
lands** (multi-screen plan D4, D5; lighting7 af3575a). The four press routes take `families?`
beside `targets`: `POST /busk/pads/{id}/press`, `/templates/{id}/apply`, `/templates/{id}/toggle`
and `/looks/{id}/toggle` (`buskApi.ts`, `templatesApi.ts`, `looksApi.ts`). The pair is the desk's
while the tab follows the desk and the tab's own when unlinked — `usePressFamilies` in
`store/selection.ts` answers it for the strip and the picker (through `useTemplatePress`'s third
argument), `useBuskingSelection` for the pads. It is the *desk's* mask when following even in the
moment another window has moved it under this tab's marquee, because a following tab's press acts
on the desk's selection and must be masked as the desk is; the strip does not pre-filter on it, and
a press outside it is refused by name rather than greyed out — but **row C's family pill reads that
same pair** (`shownFamilies` in `programmer/SelectionBar.tsx`), drawn over a row-only selection
too, so the one state where the two differ (another window's mask landed here as rows) is said on
the bar rather than discovered from a 400. The kit's bar draws the pill outside its cell block for
that reason; the plain lists keep the marquee's own reading, never bridging.

What the desk does under a mask, per kind: a **template** is one family, so it lands whole or is
400 `TEMPLATE_OUTSIDE_MASK` on every door, click and layer alike; a **Look** spans families, so its
layer lands with `propertyMask = mask ∩ its families`, the cook skips the rows outside, and the
response names them in `skippedFamilies` — nothing inside is 400 `LOOK_OUTSIDE_MASK`; a **cue**
ignores it. The two refusals carry a message naming both families and reach the screen through
`errorToastMiddleware`, which toasts every rejected mutation — which is why `useTemplatePress` no
longer toasts its own failures: it said the same sentence twice.

**The mask is tested on the on arm only, so never pre-refuse a press from the mask this tab holds.**
A press that turns a lit record off answers `removed` under any mask (`routes/pressArm.kt` reads
the arm before the press), and only the desk knows which arm a press is on — a lit Intensity pad
must still release while a Colour marquee stands. Send it, and render the desk's answer.

**The skip is toasted on the pressing window** (D6): `<Family> rows skipped — the selection is
<Family>` from `skippedRowsMessage` (`lib/selectionMask.ts`), read off `skippedFamilies` on the busk
press and Look toggle responses (the template toggle response is unchanged). It says **rows** and
must keep saying rows: the layer's mask filters its rows, not its effects, so a Look's effect in a
skipped family still runs while being named — promising the whole family was held back would be
promising more than the desk does. The window that made the marquee learns the way it learns every
layer: `programmer.layerState` carries the mask and `LookStack` draws the badge.

### Sheet kit

**One sheet, four surfaces.** The programmer's grid gestures — drag selection, single click
selects a cell, double click / ⏎ / typing opens one editor for every selected cell, ⌫ clears, one
editor per column fanned over the selected columns, the Set · Clear · Fan bar — are a kit in
`components/sheet/`, mounted by the **patch list** (`components/patches/PatchSheet.tsx`), the
**DMX sheet** (`components/channels/DmxSheet.tsx`) and the **cue sheet**
(`components/runner/CueSheet.tsx`) as well as the programmer. The design record is
`lighting7/docs/plans/sheet-views-design/` (the `Kit` artboard is the module map, `Spec` the desk
survey and the rules). The surfaces differ in their columns and their verbs, never in the gesture.

**What lifted out of `components/fixtures-list/`**, generic over the column key (`CellRef<C>`,
`CellSelection<C>`): `cellSelectionModel`, `cellSelection`, `cellMarquee`, `listSelectionModel`,
`useCellSelection`, `cellEntry` (the generic half — `orderedSelectedCells`, the two DOM guards,
and the *shapes* `CellKeyboardPermission` / `CellActionCopy`; the programmer's own answers
`cellKeyboardPermission` / `cellActionCopy` stay in `fixtures-list/cellEntry.ts`),
`cells/CellEditorSurface` and its two hooks, `ValueFieldRow`, `UnsetCellMark`, the three fold
constants (`toolbarFolds.ts`, re-exported by `SelectionToolbar`), `CellSelectionActions`,
`FanPopover` + `fanMath`, `selectionBand`, `useEscapeEditorSnapshot`. Three were extractions rather
than moves: `useCellMarquee` (a local of `FixturesTable`, now generic over rows with a
`rowHeight` and an `isSelectableRow`), `useCellEditorRequests` (the open/close one-shots and the
Set toggle from the container), and `commitToSelectedCells` / `selectedRowsByColumn`
(`sheetModel.ts` — the container's `commitToCells` / `columnTargets` over rows instead of write
targets). The fixtures list keeps its columns, row model, ownership and scope, and
`FixturesListContainer` keeps its own keyboard listener: its tests pin it, and its selection is
Redux-scoped for readers outside the list.

**A `SheetColumn<Row, C>` per surface** says how to read a row (`value`), which cell it draws
(`cell`, or `display` for a read-out), whether it fans (`fan` → a `FanPlan`), and what a commit
does (`write(rows, value)`, over the **batch**, answering false for a value it refuses) and what
Clear does (`clear`, or `clearRefusal` as the button's reason). **A commit fans only to the
selected columns that share its origin's `kind`**: the programmer tells commits apart by shape,
but a cue's name, notes and fade are all one string, so each surface column names its vocabulary
(`level` on all sixteen DMX columns, one kind per column on the cue and patch sheets) and a `3s`
typed into Fade over a Fade→Follow marquee cannot switch auto-advance on. A read-out column hangs
no `data-column-header`, so a marquee never selects it. `useSheet` is the container half — one selection in two shapes, the keyboard, the editor
requests, the throttled commit, the batch count — and `SheetTable` the anatomy: 30px uppercase
header, 36px rows (44 on the DMX sheet), a sticky first column with the 3px selection edge, the
same DOM contract as `FixturesTable` (`data-grid-header`, `data-column-header`,
`data-grid-name-header`, `data-row-id`, `data-cell`). Four kit cells go through
`CellEditorSurface`, so they get the three forms and the double click for free: `TextCell`
(commit on ⏎, Escape reverts), `LevelCell` (the DMX value, live like `SliderCell`), `OptionCell`
(`SettingCell`'s type-ahead over plain options) and `AddressCell`.

**`SelectionBar` is a shell** — counts · family pill · ⏎/⌫ hints · a `strip` slot · a `verbs`
slot — and the programmer's `SelectionBar` wraps it with the template strip in the slot.
`CellSelectionActions` takes a `permission` of `CellKeyboardPermission`'s shape and a `fan` slot,
so a disabled button and a refused key always read one object, and each surface hands in its own
`FanPopover` instance. Surface verbs come after Fan; Deselect is always last and ghost.

**The kit's `FanPopover` has four plan kinds** and the programmer's is the first one unchanged:
`value` (From · To bytes, Reverse), `colour` (two pickers), `address` (From · Step in visible-row
order, blank step = footprint) and `duration` (From · To · Spread — Linear, the one spread there
is). `fixtures-list/FanPopover.tsx` is the adapter that builds value and colour plans through
`planBatchWrites`. `useSheetKeyboard` is the kit's window listener and it is **capture-phase**:
`useTransportKeys` toggles the lock on `L` from a bubble listener whether or not the transport is
enabled, and a name typed into a cue cell begins with a character — so the sheet claims the key
first and the transport now stands aside from a key whose default is already prevented.

Three surface rules, each pinned by its test:

- **Patch list** (`PatchSheet.test.tsx`, `lib/patchAddress.test.ts`): **Set over N addresses lands
  them consecutively by footprint from the typed one**, in visible-row order, each head on its own
  universe (the PUT cannot move a head across universes); Fan on Address is From + Step. An
  overlap is a destructive ring on the Address cell with the other head on its title and a legend
  line under the sheet; the address editor **names the collision before Apply and refuses it**.
  That refusal is the only overlap check there is — **the patch PUT has none today** (only the
  POST checks), and there is no bulk atomic route, so a batch is N PUTs that can half-apply on a
  network failure; both are lighting7 work and Chris's call. Clear is refused on Address, Fixture,
  Key and Stage; offered on Mount, Angle and Gel. It is a routed page again (§List shell); row B is
  universe toggle · filter · spacer · Groups · Columns · + Patch, and the universe chips carry a
  fill bar on a 40px chrome row of their own.
  **A double click on a fixture's name opens a rename popover — the kit's `TextCell`, mounted with
  `firstColumnCellProps`** (`sheetModel.ts`), so the first column edits in the same popover, in the
  same three forms, as every value cell; the single click underneath still selects the row and a
  press still starts the row marquee. It was an `InlineEditField`, the one editor on a sheet that was
  not a popover. The pencil beside it still opens the full editor, and is the keyboard route.
  **Set over N *keys* fans one typed key over them**, `lib/fixtureKey.ts`: one head takes it as it
  is, several count up from it, continuing the number, the separator and the zero padding the typed
  key already carries — the vocabulary `AddFixtureSheet` mints keys in, read back off what was typed
  rather than imposed. Two refusals are named before Apply: a key another head holds, and a set that
  cannot be *ordered*. The ordering exists because this PUT, unlike the address one, checks
  uniqueness on **every call** — so `par-1 … par-4` re-keyed from `par-2` walks *down*, and the
  writes go out one at a time and stop on the first failure, saying how far they got. A true swap
  (the visible order is not the key order) is refused rather than broken open by parking a head on a
  synthetic key: a PUT failing after a park leaves a fixture called `par-2-tmp1` on a live rig with
  nothing to put it back. **One batch at a time**, too: `write` has to answer synchronously, so the
  loop runs detached and the editor closes over it — a second batch planned in that window would be
  planned against an `allPatches` the first has not landed in, and two plans each assuming they are
  the only writer is how one walks onto a key the other is mid-way through vacating. **`key` is also outside `METADATA_ONLY_PUT_KEYS`**, so each of those PUTs
  rebuilds the fixture registry and broadcasts — the same cost the address batch has always had, and
  the same answer: a bulk route is lighting7 work and Chris's call.
  **A batch landing is drawn one head to a line** (`cells/LandingLines.tsx`), shared by the address
  editor and the Key column, rather than joined with `·` into a paragraph read at the worst moment.
- **DMX sheet** (`DmxSheet.test.tsx`): `/projects/:id/channels/:universe/table`, sticky key
  `channels.view`, a grid of 44px cells — address and attribute on line one (the fixture
  name on the first cell of its footprint, the run tinted), the raw 0–255 value on line two,
  ownership rings read through the property that drives the channel. No row axis: the row head
  hangs no `data-grid-name-header`, so every press is a cell press, and Fan is one plan over every
  selected cell in address order. Writes are `channels.update` per address; Clear is 0; Park /
  Unpark act on the selection; the desk being offline is the read-only scope; Unpark All keeps its
  confirm and there is no Edit/Done toggle. Raw 0–255 only, no level bar — left for later.

  **A row is 16 addresses wide on a desk, 8 on a tablet and 4 on a phone** — `DMX_ROW_WIDTHS`, the
  widest arm whose `48 + 64 × n` the container can draw without scrolling sideways, measured by
  `hooks/useContainerBand.ts`. It halves rather than taking any n so that a fixture's footprint
  still reads across a row and a row's base stays a round address (`001`, `009`, `017`). A
  container query cannot answer it: the count is JavaScript, not a class. **Changing arms drops the
  cell selection, during the render that changes it** — 16, 8 and 4 are multiples, so every wide
  row id exists narrow too, and the same `rowId · col` pair would silently name a different
  address; done in an effect it left one painted frame where `selectedChannels` named an address
  nothing showed as selected.

  Its cells set **`SheetColumn.gutter: false`**: they draw no corner glyph, and the kit's 18px marks
  gutter made a cell's own ownership ring a box 18px narrower than the selection overlay drawn over
  it — the two lines an operator reads a channel by, disagreeing on three of four edges. Without it
  the wrapper is padded 2px all round and `cellSelectionClass` insets the overlay to match.

  **The route is full height, not a `Card` in a scrolling page** (`routes/ChannelsTable.tsx`): as a
  card the page scrolled *and* the table scrolled inside a `calc(100vh - 14rem)` cap, two bars for
  one list, and a 393px-tall landscape phone got 169px of grid. Its breadcrumb header is 48px like
  `ShowHeader`'s and `StackDetail`'s — a header, not one of the 40px chrome rows.
- **Cue sheet** (`CueSheet.test.tsx`): `/projects/:id/show/stacks/:stackId/table`, sticky key
  `show.view`, the switcher on the `StackDetail` header. Name · Fade · Curve · Follow · Notes are
  cells, and the cue number is a `TextCell` on the Cue column (`firstColumnCellProps`) **opened by a
  double click** into the same popover as every value cell beside it (a single click there selects
  the row — it was a single click that had to swallow the press, which made the Cue column the one
  column where a click meant something different). **Locked, the number is plain text rather than a
  disabled trigger**, because a click on it must bubble to the column to arm the cue and a browser
  dispatches no click for a press inside a disabled button. Layers · FX are read-outs that open the card on the cards view
  (with `CARDS_LINK_STATE`, so the sticky does not bounce it
  back; a peek is not a change of view); **Book opens the Prompt Book** at that cue instead, through
  `?cue=`, which is that page's arrival contract and the mirror of the one it mints for Show — it is
  the one read-out that names a place in another document. **No Hooks column**: `CueStackCueEntry`
  carries no trigger count, and adding one is a backend field.

  **A cell that cannot be selected is blank**, not an em-dash: the em-dash is the mark an *empty but
  settable* cell wears (Follow, Notes), and wearing it on a read-out and on a snap cue's Curve made
  half the sheet's dashes look editable.

  **The lock is the sheet's read-only scope** the way
  Output is the programmer's — locked, every value cell is inert in all four places, the marquee
  still works, and a click on the Cue column arms
  the cue as next; unlocked, cells edit under the amber wash. **A refused edit asks to unlock**
  rather than doing nothing: Set · Clear · Fan stay live and open a confirm, and so does ⏎ — through
  `useSheetKeyboard`'s `onRefused`, which reports the refused gesture **and the key** and lets the
  *surface* say whether to claim it. The kit takes no view on which keys are safe: that depends on
  what else the surface has bound, and here it is Enter alone, because while a show is locked
  `useTransportKeys` owns Backspace (BACK) and a typed `l` (the lock toggle, the keyboard's own way
  back) and both stand aside on `defaultPrevented`. That reasoning lives in `CueSheet`, beside the
  hook it is about, and `CueSheet.test.tsx` pins both keys as untouched. The offer is withheld where
  the lock is not the operator's to lift (`canEdit` false), where the disabled verbs and their
  reason are the honest answer. Writes are one PATCH per cue carrying
  the field, the cards' own auto-saving contract. The transport is otherwise untouched:
  `useTransportKeys` is enabled exactly while locked, as it always was, and `canOperate` is never
  handed `locked`.
  The sheet consumes `?cue=` by selecting the addressed cue's row and scrolling to it — the
  external contract holds on both views.

  **Unlocked, a grip in the Cue column reorders cues and separators** — `SheetTable`'s `rowDrag`,
  on the cards view's own `reorderCues`, so one gesture and one mutation serve both. The
  `DndContext` is mounted only where a surface asks for it and the rows are turned off through
  dnd-kit's `disabled` rather than by unmounting it (`StackDetail` learned that one); the grip
  stops its own `pointerdown` propagating, or starting a drag would also start a marquee.

  **A sortable row is positioned with `top`, never the virtualiser's `translateY`.** dnd-kit
  measures droppables with transforms discounted, so rows positioned only by a transform all measure
  at the container's origin: every centre-distance ties, `closestCenter`'s stable sort returns the
  rows in DOM order on every frame, and the drop lands on the row the drag began on. It does not
  fail cleanly — dragging **up** still works, because for an upward drag DOM order and distance order
  agree — which is how it survived a first browser check. `CueSheet.test.tsx` pins the `top`; the
  sheets with no row drag keep `translateY`, having nothing else competing for `transform`.

**Cards · List and Cards · Table are one switcher and one storage vocabulary.** Fixtures and
Groups keep the word *List*; Channels and Show say *Table* (their second view is a table and their
first genuinely is cards). The stored value is `'list'` for all four keys, so `getStoredCardsListView`
answers every pair and a rename can never reset a desk's remembered view; `stickyRedirectsToList`
is the one redirect decision, called by all four cards routes (`ViewSwitcher.test.ts`).

### List shell

**Every list view is one column, stated once.** Fixtures › List, Groups › List, the programmer,
Show › Table, Channels › Table and the patch list share one anatomy — a 48px header row, any
number of 40px chrome rows, the 40px `SelectionBar`, the sheet, a 22px footer — and the whole of it
is two files: `components/sheet/sheetFrame.ts` holds the class strings (`PAGE_HEADER_CLASS`,
`CHROME_ROW_CLASS`, `SHEET_SCROLLER_CLASS`, the sheet header row and cell, the sticky cell, the row,
the divider, `SHEET_FOOTER_CLASS`), and `components/sheet/SheetPage.tsx` the thin components over
them (`SheetPage`, `.Header`, `.Row`, `.Footer`, `.Empty`) plus the one `LegendSwatch`. `SheetTable`
and `FixturesTable` draw their frame from the constants; every surface mounts the components and
never writes the classes. A surface that wants to differ says so at the import, in one file. The
design record is `lighting7/docs/plans/list-shell-design/` (`Kit.dc.html`'s "Where the code goes"
is the file-by-file map; the five open calls are made on `Spec` under "Called — 2026-09-15").

The rules the two files encode, each of which was a measured inconsistency before them: a list is a
full-height column filling `<main>` — **no `Card`, no page scroll, the sheet is the only scroller**;
a 12px gutter on every row; header 48, every other chrome row 40 with 32px controls, footer 22, sheet
header 30 and rows 36 (44 on the DMX sheet); **three grounds** — the page (`<main>`'s `bg-muted/40`,
which every chrome row sits on with no ground of its own), the sheet (`bg-background` on the header
row, the sticky column and the body alike, so a name column can never read darker than its cells)
and a divider row (`bg-muted/30`); and **one line between neighbours** — a chrome row owns its
`border-b`, the sheet owns no top line, the footer owns its `border-t`. **Two named exceptions, both
by decision:** the programmer's row A keeps its `bg-card/50` wash, and `ShowHeader`'s border stays
transparent until the unlocked wash colours it.

Three things the shell changed that read as bugs if you do not know they are decisions. **The two
plain lists have row C and a footer now** — reserved (`Nothing selected`) when nothing is, the
count in the footer — so `SelectionToolbar` draws no count of its own, and `FixturesListContainer`
has one arm: no `fill`, no `space-y-3` wrapper, and its default toolbar is the shell's row plus
the programmer's own `SelectionBar` with no `projectId`, which is what draws it without the
template strip — one component, so the two bars cannot count a marquee two ways. The bar's own
`@container` sits above it on those two routes as everywhere. **The strip folds — the verbs' words
at 1100 and Locate · Highlight at 800 — apply only on a bar that carries a strip**: the kit's
`SelectionBar` marks itself `group/bar` + `data-strip` (from `foldForStrip`, defaulting to "there
is a strip"), and `WORD_CLASS` / `STRIP_MID_FOLDED_CLASS` in `toolbarFolds.ts` are gated on it.
Those folds exist to give the template strip room; on the plain lists, the DMX sheet, the patch
list and the cue sheet nothing needs it, and a 1100 fold there emptied every word at once on an
ordinary 1160px window.
`SheetPage.Header` and `.Footer` put their `@container` on an unpadded wrapper, never on the `px-3`
row: a size query measures the content box, and a container on the row would fire every threshold
24px early. **Loading and not-found render inside the same `SheetPage`** — an empty header row over
`SheetPage.Empty` — so a list keeps its shape from loading to loaded. And **the patch list is a
route again**, `/projects/:id/patches`, with the chips as a 40px chrome row of 28px chips above row
B: it left Project Settings because a tab body under a settings heading was the one list that could
not have the header row and the gutter. `/settings/patches` redirects there, `?action=new` intact.

### The cell editor's three forms

**A cell editor is a popover on a desk, a bottom sheet on an upright phone, and a right-hand sheet
where the viewport is short.** `components/sheet/cells/CellEditorSurface.tsx` is the one
place that decides, and every cell goes through it — the programmer's four (`SliderCell`,
`ColourCell` via `ColourPickerPopover`, `PositionCell`, `SettingCell`) and the kit's four
(§Sheet kit). There were **five**: the marquee's own typed
field, `CellEntryPopover`, drawn through this same surface precisely so that Enter and a click
would read as one kind of thing. It is gone, and the reason is the stronger form of that argument —
§The programmer's keyboard.

Three rules, each of which was learned rather than designed:

- **Short beats narrow.** A landscape phone matches both queries — 852×393 — and the bottom sheet is
  the one shape that needs the vertical room a short viewport has not got. The width query is the
  `sm` breakpoint the sheet primitive itself uses (`max-width: 639px`); the height one is the space
  plan's own `max-height: 500px` fold, duplicated and pinned by `shortViewport.test.ts` like every
  other site of that number.
- **Width is the content's to ask for, and so is the compact layout.** `wide` on the surface is the
  colour editor's alone — 35rem against 22rem for the other three, which looked absurd in that much
  room. `useCellEditorCramped()` is a *separate* `max-height: 750px` question, because all three
  forms can be short of height: below it the colour editor draws a two-column layout with its
  emitter rows beside the picker. 750 and not 500 because **a popover must fit beside its cell, and
  a cell can be any row**, so the room it really gets is about half the viewport — below ~725 there
  is a band where neither side holds the full 357px editor, Radix flips it above the cell, and
  `limitShift` then refuses to slide it back down because that would cover the anchor. It renders at
  a negative `top` and the window clips it, silently. Found on a 852×524 screen, not by a test.
- **"Is this a touch surface" is the form, never a `sm:` variant.** `SettingCell`'s option rows are
  the one control that *is* the list, so they need a finger-sized height on both sheets and not in
  the popover. A `sm:` variant says `min-width: 640px`, which is true of the landscape phone the
  side sheet exists for — so the first version shrank the rows on the very surface they were added
  for. Width cannot answer that question on this desk.

Two things the sheets carry that a popover never needed. **The keyboard's bite** is measured from
`visualViewport` and given back — the bottom sheet rises by it, the side sheet shortens — because a
`position: fixed` sheet is laid out against the *layout* viewport, which does not shrink when iOS
opens the keyboard, so a sheet holding a number field would slide neatly behind it. And the
**safe-area inset is added to the side sheet's width rather than padded into it**: as padding alone
it came off the content box and the colour picker no longer fitted, so the sheet scrolled sideways
on whichever rotation puts the notch on that edge. `SheetContent`'s own `sm:max-w-sm` silently caps
an inline width, so `maxWidth: 'none'` goes with it — the symptom of forgetting is a sheet that
stays narrow and scrolls, which looks exactly like the width never being applied.

**On the programmer's grid a single click on a cell selects it, and a double click opens its
editor.** The whole of a single click is the selection: one cell, replacing whatever was there —
including when the cell is already in the marquee, which is how a rectangle is narrowed to one of
its own cells, the one thing a rectangle cannot say. The editor is opened by the selection bar's
**Set**, by Enter, by typing (§The programmer's keyboard), or by a **double** click, so the drag,
the single click and the keys all say *what* to edit and one gesture says *edit it*.

**The double click is that second gesture made with the pointer alone**, and it is the surface's
rather than the four cells': `CellEditorSurface` decides it once, above the form branch, so all
three forms and all four value kinds answer it identically — the reason `CellClickBehaviour` is one
type rather than four copies of two props. It opens through the same `onOpenChange` every other
opener uses, so it lands in `useCellEditorOpen`'s click path: beside the cell (Set's toolbar anchor
is Set's alone), with no typed seed, and with whatever a click's open resets reset. It is wired
**only where a single click selects** — in `CueValueGrid` a single click already opens, and two of
them would toggle the editor shut and back open. And it needs no
*permission* gate of its own: a `disabled` trigger fires no click and therefore no double click,
which is how Output scope, a focused template layer and an unreachable desk stay read-only through
this door as much as through the other three.

**The handler is withheld while that cell's editor is already open**, because `setOpen(true)` is
not idempotent: it re-runs the cell's own open reset (`SliderCell`'s `draft.reset`, `SettingCell`'s
filter) over what the operator had half-typed, and re-latches `atButton` to false — which swings a
Set-anchored panel across the screen *and* swaps the branch from `TriggerState` to `PopoverAnchor`,
two component types at one JSX slot, so React remounts the operator's own button under their finger.

**Do not delete the guard on the grounds that Radix already closes the editor first.** At the desk
it does: the gesture's first `pointerdown` is an outside press on the open content, and
`DismissableLayer` listens for `pointerdown` on the document, so the `dblclick` lands on an editor
that has already shut and simply opens it again — verified in the browser on this change and on the
commit before it, where a single click on an open cell behaves identically. But that dismissal is
the *environment's* and not a rule this code states, and a test never reaches it: `fireEvent`
dispatches exactly the one event it names, so no `pointerdown` is seen, the listener never runs, and
the second open goes straight through. Both tests in `CellEditorSurface.test.tsx` fail if the guard
is dropped. **The difference is not Radix rescuing the browser case** — `PopoverContent` suppresses
an outside press only where it lands on a real `PopoverTrigger`, and this grid renders none in
either environment.

**The handler goes on the wrappers that already clone the trigger, never in a wrapper of its own.**
Each branch hands the trigger through a `Slot` as it is (`PopoverAnchor asChild`, `TriggerState`),
so a `<TriggerDoubleClick>` around it — which is how this was first built — meant a *second* clone
per cell per render, on a grid that mounts one of these per visible cell and re-renders the whole
viewport on every frame of a marquee drag. The nested slot was a trap besides: an outer slot hands
its child the anchor `ref` and `data-state` as props, so the wrapper had to forward them or the
popover would never be positioned and no cell would be marked open.

Three consequences worth knowing before touching any of it:

- **The trigger is a `PopoverAnchor`, not a `PopoverTrigger`** (`triggerOpens` on
  `CellEditorSurface`, set from `CellClickBehaviour`, which is one type rather than four copies of
  two props precisely so the four cells cannot answer this differently). Radix then has nothing to
  toggle and the button's own `onClick` is free to be the selection. `data-state` is restored by
  hand on the anchor: it is the only thing that says *which cell* the open editor belongs to, and
  the grid's addressing contract is read through it.
- **All three lists answer a click the same way, and `FixturesTable`'s `cellSelection` is
  required.** Fixtures → List and Groups → List were the exception until this session: no
  `cellSelection`, so a click there opened the editor *and* selected the clicked **row** — which
  was the honest answer while they had no cell selection for the toolbar, `commitNow` or
  `batchCountFor` to read, and which made one component answer one gesture two ways depending on
  the route it was mounted under. They have the marquee, the keyboard, Set · Clear · Fan and the
  double click now, and `showOwnership` is back to meaning only what it says: draw provenance.
  `clickSelectsCell` went with the branch — `FixturesListContainer` is this table's one caller, so
  the flag was a constant — and the cells keep their own `clickSelects` for `CueValueGrid`, which
  has no selection and would otherwise lose every way into an editor.
- **What the two plain lists keep of their own is the *row* Fan** (`!showOwnership`), over the whole
  row selection with the column chosen in the panel. A row selection there is made by dragging the
  name column or by ⌘A, and fanning across eight whole heads without first drawing a rectangle over
  one of their columns is a gesture those views already offered; the programmer trades it away
  because there the marquee is what a selection is *for*. They also now mount `useClearCellEffects`
  — a subscription of their own, which the programmer gets free from `ProgrammerFxList` — because
  ⌫ clearing the values while the effect driving them kept running is, on the rig,
  indistinguishable from the key having done nothing.
- **A click on a column the row resolves nothing for clears the selection** — a dimmer-only par's
  Colour cell. It is blank rather than an em-dash, and it is *not* background in the DOM (the row
  carries `data-row-id`, which the scroller's background handler stops at), so it carries
  `onEmptyCellClick` itself. That callback reaches `RowView` through a ref, because the container's
  answer is the cells-then-rows ladder and so changes identity on every marquee frame — passed
  straight down it would re-render every visible row at pointer rate.
- **Escape is a rung longer than it looks.** An open editor takes it first and the selection
  survives; a second Escape, with nothing open, clears as it always did. The question is *is an
  editor open* (`cellEditorIsOpen()`, a DOM read of the surface's own attribute) and not *where was
  the key pressed*, which is what `isEditableTarget` and `closest('[role=dialog]')` answer — a
  different question, and one that answers wrongly the moment focus is not inside the panel.
  **The answer is snapshotted in the window's capture phase**, because Radix listens on the
  *document* and the grid's handler on the *window*: on the way up Radix closes the panel first, and
  a keydown is discrete so React has already flushed the unmount — asking in the bubble handler
  always answers "nothing open" and clears anyway. Capture on the window is the first thing any
  keydown in the document reaches.
- **Set closes the editor it opened**, the way Fan's own button always has — through a `close`
  one-shot mirroring `keyboardOpen` (`closeEditorCell` → `autoClose`). It needs one: a press on Set
  is **not** the outside click that dismisses a popover, because Set is that popover's own anchor.
  Verified at the desk rather than reasoned — pressing Set twice left the panel open with focus
  stranded on the button, which is what made Escape clear the selection. Which cell to shut is read
  from the `data-state` the cell's anchor carries, scoped `[data-cell]` so `FanPopover`'s own panel
  — a cell editor in every way but this one — does not read as one.

**The editor opens where the gesture was made.** Set is pressed at the toolbar, so its editor opens
at the Set button (`anchorRef` on `CellEditorSurface`, `editorAnchorRef` threaded container → table
→ row → cell); **Enter and a typed character are made at the selection, with the operator's eye on
the grid, so theirs opens beside the cell** — the cells express that by withholding the anchor
(`atButton ? editorAnchorRef : undefined`) rather than by a second prop on the surface. Anchoring
*everything* at the cell was the original defect: for a marquee near the bottom of a long list the
panel landed nowhere near the hand that pressed Set. Three rules in it:

- **The choice is latched at open**, in `useCellEditorOpen`, exactly as `keyboardSeed` is. The
  request is a one-shot the table drops on the very next commit, so a per-render read would
  re-anchor the panel from the button to the cell a frame after opening — visibly jumping across
  the screen.
- **The ref is read at render time and only while open**, because a `virtualRef` whose `current` is
  null sets Radix's anchor to null and the content is then never positioned at all. So no button
  means the cell, which is what a double click gets on any of the three lists.
- **The virtual anchor is rendered after the cell's**, which is what makes it win: it claims the
  anchor from an effect, and effects run after the refs of the same commit.

**An editor closes when the selection it was opened for goes away** (`selectionEmpty`, threaded to
`useCellEditorOpen`). An editor is open *for* a selection, so a Deselect used to leave one on screen still
writing — to something narrower than its own "Applying to N targets" line had just claimed. It is
**edge-triggered**, on the false→true crossing and not on the state, or a grid with no selection at
all could never open one: the close would land in the effect immediately after the click that
opened it, and the editor would flicker rather than fail in a way anyone could report. `undefined`
is a third state meaning "the question does not arise", which is what `CueValueGrid` passes.

**React bubbles synthetic events through portals**, and every cell editor is rendered from inside a
row — so the grid's marquee saw a drag on the dimmer slider as a press on the grid, and selected
cells under the operator while they were setting a value. `useCellMarquee`'s `onPointerDown` asks
the DOM (`e.currentTarget.contains(e.target)`), which is the same guard the scroller's background
`onClick` beside it already documented and this one was simply missing. Any new handler on the rows
wrapper needs it too.

### The programmer's keyboard

**There is one editor per column, and the keyboard opens it.** Select cells, press Enter (or just
start typing), and the cell editor for the first selected cell opens with its first text field
focused and selected; what it commits lands on every selected cell through `commitToCells`. Enter
in any field applies and closes, comma steps to the next field, and the marquee stays so the next
Enter opens it again.

**It used to be two editors**, and that is the thing to understand before touching any of this. A
click opened the column's editor; Enter opened `CellEntryPopover`, a single line of text with a
grammar of its own (`parseCellEntry`: `127`, `50%`, `full`/`out`, `#ff8800`, `r,g,b`, `pan,tilt`).
Both are deleted. Two editors for one job drift, only one of them can be improved at a time, and
the text one could only ever set what a line of text can say. What went with the grammar, and where
it went instead:

- **Hex typed as text** — replaced in kind: the picker and the R/G/B boxes say the same thing.
- **`pan,tilt` and `r,g,b`** survive as a **gesture** rather than a grammar: comma steps to the
  next field. That is what `PositionCell`'s new pair of boxes is for — it had none, only a drag —
  and what makes the colour editor's R → G → B → emitters a typed sequence.
- **`50%`, `full` and `out` are gone, and nothing replaced them.** The level editor's box is
  `type="number"`, so those characters cannot be typed into it at all. Said plainly because it is
  the one part of the deletion that was a real loss rather than a relocation: it was put to the
  desk as a question and answered *leave it as built*, on the same reasoning as hex. Getting them
  back means a text grammar in the byte field, which costs that field its spinner and its
  arrow-key increment — so ask before reaching for it.

`components/sheet/cells/useCellEditorKeyboard.ts` is the one copy of the rule, shared by
every cell — the programmer's four and the kit's — **and by `FanPopover`**, which is the same kind
of panel and had the same gap. Two
things in it are not arbitrary. The focus is taken in **`onOpenAutoFocus`**, not in an effect:
Radix's own auto-focus is a *parent* effect and parent effects run after a child's, so a focus set
from inside the content is taken straight back off it. And **comma is left alone in a one-field
editor** — there is nowhere to step to, and a type-ahead may want the character.

**The panel behaves the same however it was opened** — the selection bar's Set, a keystroke, or a
double click on the cell. The first field is focused in all of them, and that is
not a nicety: *drag three dimmer cells, Enter, type `128`, Enter* is the ordinary desk gesture, and
it only works if the open leaves the field focused. A first cut focused the field only for a
keystroke, on the reasoning that a tap must not summon the on-screen keyboard, and quietly broke
exactly that. Refuse any change that makes focus a function of the gesture again.

**A released drag opens nothing, and neither does a single click.** The drag half went first
(`PD-POPUP-AFTER-DRAG`: a single-column marquee opened its first cell's editor behind the release)
when the selection bar gained a **Set** of its own; the click followed it, for the same reason. The
drag and the click say *what* to edit and Set — or Enter, its key, or a **double** click — says
*do it*; a popover springing open under a pointer that had just finished drawing a rectangle was
the second gesture being made for the operator, and it had no equivalent for a drag that spanned
two columns. `singleColumnAnchor` and
`onSingleColumnDrag` went with it; `autoOpenCell` in `FixturesTable` is fed by the container's
`keyboardOpen` alone now, whichever way the operator asked — the double click never reaches it,
being the surface's own.

**The one thing that does differ is the *form*, not the gesture.** Focus is taken in the popover
and in neither sheet (`useCellEditorForm`), because both sheets are reached by a finger and there
the keyboard rises over the grid for nothing. That is a question about the surface, so on any one
surface every way in still behaves identically. `FanPopover` opts out with `autoFocus: false` only
when the marquee spans several fannable columns: then its first question is *which column*, and
jumping to the From box would skip the chooser that decides what From means. With one column the
selection has answered that, and From is focused like any editor's first field.

**`keyboardSeed` carries the character and nothing else.** A string (`''` for a bare Enter, null
for a click or a drag) threaded container → table → cell, latched by `useCellEditorOpen` into
`keyboardOpen` for as long as the editor is open, and read only to seed the first field.

**A character typed at the grid opens the editor and lands in its first field**, committing as
though it had been typed there — every field on this desk writes as it is typed. Digits, `.` and
**letters**: a letter is the first character of `SettingCell`'s type-ahead, and a numeric editor
simply ignores one (`numericSeed`). `#` and `,` went with the grammar — there is no hex to start,
and comma now means something inside an editor.

**`SettingCell` is a type-ahead** above three options (below that there is nothing to narrow): the
filter matches on display name, ↑/↓ move the highlight, and Enter takes the highlighted option —
the top match by default. An Enter that matches nothing is swallowed rather than closing, because
closing would throw away a search halfway through being fixed. It answers Enter and the arrows
itself and says so with `preventDefault()`, which is how the shared wrapper knows to stand aside.

**One column's editor for a selection that spans several is not a narrowing.** `commitToCells` fans
a commit across every selected column and drops it from the ones whose shape it does not fit — so a
Dimmer + Colour marquee opens the dimmer's slider, and moving it sets the dimmers and leaves the
colours alone, exactly as `127` did. `orderedSelectedCells` picks the order — topmost displayed
row, leftmost visible column — the display-order rule a released drag's auto-open once shared,
extended to the column axis — and the container takes the first cell that **has an editor**.
That second half is load-bearing: a marquee is geometric (`hitsFor` sweeps a rectangle
over rows and column bands), so it covers Colour cells on dimmer-only pars, and taking the
display-first cell flatly would leave Enter doing nothing on an ordinary mixed selection.

**`cellKeyboardPermission` in `cellEntry.ts` is the scope gate**, the fourth place "read-only" is
said (§The programmer's scoped grid): both keys in Local, neither in Output, entry only into a
focused Look layer (its draft has no removal), neither on a focused template layer. The container
reports `cellEntryKey` / `cellClearKey` false where a key is refused, and the grid's hints read
those rather than restating the rule — so no hint can advertise a key that does nothing. The window
handler only names a cell, and **not from a focused control** (a button, a link, a menu or menu
item) on any arm: a cell trigger is tabbable and Tab-then-Enter opening its popover is a path the
grid already promises, and Backspace is the destructive arm. The one exemption is a cell trigger the
marquee itself covers (`marqueeOwnsKeyTarget`), or Enter there would fall through to that button's
own activation and open *that* cell's editor with nothing focused.

**Backspace / Delete takes the selected cells out of Local** (`CellWriters.clearValue` →
`programmer.clearEntry`, by the programmer fade — the same store the action bar's Clear fades by)
— **and stops the local effects on them**. That second half is not a new gesture: the programmer's
whole-desk Clear has always swept values and programmer-band FX together
(`clearProgrammerCompletely` in lighting7), and three cells under an effect template's press are
three instances that were otherwise removable only one at a time in the rail.
`components/fixtures-list/cellEffects.ts` owns the rule and `useClearCellEffects.ts` the wiring;
two clauses keep the key inside the rectangle. **Local means unowned** — `programmerOwned` *and*
no `lookId` / `templateId` / `programmerLayerId` / `cueId`, since an effect that came out of a
Look, a template layer or a cue is that thing's, and stopping it here would be undone by the next
recook or would quietly edit a library record. And **every head, or none**: an effect drives
whatever its target names (for a group, every member) and there is no "stop it on these heads
only", so a partly-covered one is left running and toasts that it was, rather than half vanishing
from the rig. Matching is on `fixtureKey|propertyName`, the same pairing `FxSheet` places an
effect on a cell by, and the pairs are **collected by the clear loop itself** rather than
re-derived, so the values half and the effects half cannot reach different heads.

The request itself is a **one-shot** on both halves: the container drops it on the commit after it
is set, and `FixturesTable` folds it into `autoOpenCell`, so there is one mechanism for "open that
editor with no click" — Enter and the bar's Set are the same request. A request left standing
re-opens the editor the next time the virtualiser renders the row it names.

### One selection, two shapes

**Rows and cells are one selection**, and either clears the other — on every sheet; `useSheet`
is the kit's copy of the rule for the three surfaces whose row selection is local (§Sheet kit). They were two independent states
— a row selection with checkboxes that Record scoped on, and a cell marquee drawn over it as a
transient edit scope — and an operator had to hold both in their head to know what the next gesture
reached. Now `FixturesListContainer` derives one `selectedRowIds` (the cells' rows under a marquee,
the row selection otherwise) and every consumer reads it: Record's published targets, Locate and
Highlight, the desk-selection bridge, the template strip and the footer count. A marquee *is* the
fixture selection, narrowed to some of their attributes. Enforced at the doors, not by an effect:
the cell door (`selectCells`) clears the rows only when a hit arrives and there are rows to clear,
and every row door (`selectRow`, `selectAllRows`, `setRows`) clears the cells, whose `clear` bails
when there are none. `cellRowIds` is identity-stable while its *members* are unchanged, or a drag
would republish to the desk on every pointer move rather than at each row boundary.

**The desk selection is one fact with three parts — targets, `families`, `source` — and a marquee
publishes two of them** (multi-screen plan D2, D3, D7; backend af3575a). `selection.state` is
`{targets, families?, source?}`, both new fields *omitted* when absent, never null: absent
`families` is every attribute, absent `source` is nobody since the last clear. The rule that keeps
the mask part of the selection rather than a second fact: `set` replaces the whole fact (no
families = clear the mask), `toggle` keeps it, `clear` drops both. So `useDeskSelectionBridge`
publishes `cellFamilies(cells)` beside the rows — `FixturesListContainer` hands it the cells — and a
row selection with no cells publishes *no* mask, which is a `set` that clears the desk's. The
publish is keyed on the mask's **key** (`familiesKey`, `lib/selectionMask.ts`), not on `cells`,
because a drag mints a fresh `cells` array per frame; `normaliseFamilies` is the one spelling —
none and all four are both `null`, declaration order — so an echo compares equal to what was sent.
**The echo FIFO's key is targets *and* families**: a frame with the same heads and a different mask
is exactly what a second window changing the mask under a standing marquee produces, and a key of
the heads alone swallowed it as our own echo. It is applied as a **row** selection — this list
cannot draw a mask it did not make as a marquee, so the marquee is dropped to its rows. A frame the
FIFO *does* treat as an echo still lands its `source` in the cache, because the cache is
`store/selection.ts`'s and is written before the bridge's effect runs (`decodeSelectionState` keeps
the untouched parts' identities, so a source-only frame moves the chip and nothing else).
`source` is stamped by the desk from the window this socket **announced**, never sent: the
`windows.announce` every tab sends on connect and on every change (§Windows, full screen and the
hand) carries its name, and the desk stamps `source` with that name **and the socket-minted row
id** (lighting7 d774fd9). No selection write names this window any more — session 1's `sourceName`
on `selection.set` / `selection.toggle` is gone from this side, and the desk's fallback arm for it is
`FU-WINDOWS-RETIRE-SOURCENAME`, ready to delete.

**The chip resolves "this window" through `windows.state`, not through `sessionStorage`**
(`deskReading` in `components/desk/DeskChip.tsx`). `source.id` is the mover's *row* id, which a tab
never sees except in its own registry row, so *my* row is the one whose `windowId` is this tab's
(`thisWindowRow`, first match), and the chip reads *Desk* when `source.id` equals that row's id,
*Desk · from <name>* when it names another row — the row's *current* name, so a rename shows without
a new write — and *Desk · from the desk* for kind `surface`. `source.id` is absent for a surface
write and for a socket that never announced; there the chip falls back to comparing names, which is
what a pre-registry client still gets. A duplicated tab copies its `sessionStorage`, so two rows can
share one `windowId` and neither the tab nor the chip can tell them apart: the twin's write can read
as this window's own. Cosmetic, accepted by D9, and left; `FU-WINDOWS-OWN-ROW-ID` is the exact fix.

**Follow / local is a per-tab `sessionStorage` fact, default on** (`lib/deskFollow.ts`, D8), and it
gates **both** directions of the bridge, since one bridge is both. `localStorage` is one value per
origin per profile, and the two desk screens are two windows of one profile — `createSyncStore`
took a `storage` parameter for exactly this. Unlinking snapshots the desk's targets *and* families
into the tab's copy and leaves the desk's alone; re-linking adopts the desk's and publishes nothing
(the bridge treats re-enable as a fresh mount, for the mount rule's reason: a window joining must
not clear what another screen has selected). On the programmer the local selection *is* the list's
own row selection — an unlinked window records and presses what it shows; on the busk view it is
the copy in `deskFollow.ts`, read through `useSelectionPair`. **The desk chip**
(`components/desk/DeskChip.tsx`) is the control and the readout: `Desk` when nobody has moved the
selection or this window did, `Desk · from <name>` for another window, `Desk · from the desk` for
a control surface, dashed `This window` when local; a click flips it. It sits on the programmer's
row C between the family pill and the strip (a `chip` slot on the kit's `SelectionBar`, filled only
with a `projectId`) and in the busk band's label row beside the family pill, and nowhere else —
the plain lists never bridge (D1), so a chip there would name a link that does not exist. **On the
busk band it takes `showSubject` and reads `Targets: Desk`**, because there it has a sibling — the
page chip (§The busk layout) — and two bare `Desk` chips a row apart would be worse than either
alone; on row C it is alone and stays bare, that row being budgeted to the pixel. The pill itself is
`components/desk/FollowPill.tsx`, shared by both chips so they cannot drift apart visually while
their flags stay entirely separate.

**The checkbox column is gone, and a drag from the name column selects rows** — the same
`useCellMarquee`, which decides at the press which side of the first value column it landed on and
never changes its mind mid-gesture (a rectangle dragged from the name column into the values is
still a row marquee, the way a spreadsheet's row-header drag is). A plain drag replaces; a ⌘-drag
unions onto the selection it *began* over, so shrinking the rectangle un-selects, which the cell
marquee's per-frame accumulation does not do. The list hands the whole id list to `onRowMarquee`
only when it changed, and the release's click-swallow is load-bearing twice over there: the name
cell's own `onClick` would otherwise select the one row under the release. Enabled on all three
lists, since the checkbox went from all three: without it the two plain routes would have had no
way to accumulate a selection by touch. The keyboard path is window-level and deliberately has no
per-row control: ⌘A, ↑/↓ with Shift extending, and **→/← open and close the anchor row** — a group
over its members, a multi-head fixture over its elements — with ← on a member or element climbing
to its parent first, the ARIA tree convention (`treeKeyAction` in `rowModel.ts` is the rule).

**The grid's rows are `select-none`, and a fixture name is no longer selectable text.** Three
declarations ride together on the rows wrapper — `select-none`, `touch-manipulation` and
`[-webkit-touch-callout:none]` — each for a browser default a marquee was losing to
(`PD-MARQUEE-TOUCH`), and they are unconditional on all three lists. The two plain ones carried a
narrower arm while they had the row marquee alone: text selection was refused only *while* a row
drag was live, so a fixture or group name could be selected and copied straight out of the list,
which their comment named as deliberate. A cell marquee costs them that, and it is a real loss on
two everyday browsing views rather than a tidy-up — the name is still copyable from the detail
sheet, which is weaker. Recorded rather than argued: if it turns out to matter, the fix is to
exempt the name cell's own text, not to put the narrow arm back, because that arm leans on `arm()`
clearing whatever the browser began selecting in the five pixels before the threshold.

**The selection bar's cell verbs are Set · Clear · Fan** (`CellSelectionActions`), drawn before
Locate and Highlight when the selection is cells. Set and Clear are Enter and Backspace with a
button on them, and take the container's gate (`cellKeyboardPermission`) and words
(`cellActionCopy`) so a button cannot promise a gesture the keyboard refuses; Output and a focused
template layer show them disabled with the reason, and Fan makes the same two refusals itself
(it is also drawn on the two plain routes, which have no scope). There is **one** Set —
its title names where the value lands (Local, or the focused Look's rows), and that is the scope's
answer rather than the press's. A "track it" arm the way a template chip has (⌥click) makes no
sense on a value: a typed number has no referent for a layer to follow, and *Make layer* on the
rail is how local literals become something trackable afterwards. Set and Clear keep their icons
at every width and only Fan folds on the phone arm, because on a phone Set is the only way into a
selection's editor now that a drag opens nothing.

**Fan reads the marquee, not the fixture selection**, and opens in `CellEditorSurface` like the four
cell editors. The column comes from the selection — `FanPopover` takes one `FanColumn` per selected
column, targets in visible row order, from the same `columnTargets` expansion `commitToCells`,
Backspace and the batch count use — and the chooser is drawn only when the selection spans more
than one fannable column. Focus follows: with one column the first question is From and it is
focused on open; with several it is still *which column*, so nothing is. Enter still *applies*,
since a fan is the one panel here that does not write as it is edited. The two plain list routes
select cells like the programmer, but they *also* keep the whole-selection row Fan they always had
(`fanColumnsForTargets`), drawn in the toolbar's `actions` slot with nothing selected but rows —
the cell verbs replace it the moment a cell is.

### The programmer's scoped grid

Session 2a gave the programmer's value grid a **scope**, and it is the mechanism most of the session
rests on: Output (the cook, read-only), Local (what *you* set, and nothing else), or one focused Look
layer. Same grid, same cell editors, same drag-select in all three — that sameness is the point,
because it is what makes editing a Look feel local rather than like a trip to the library.
`components/programmer/ProgrammerScope.tsx` owns it; the band above the grid is
`ProgrammerScopeBand`, and a layer is focused by clicking its name badge in the stack rail.

**The programmer's chrome is one spacing system**, and every number in it is stated once here so a
row cannot drift from its neighbours (design record: `lighting7/docs/plans/programmer-chrome-design/`,
whose `INDEX.md` has the reasoning). A 12px gutter on every row, the `ShowHeader` included — and
that header is shared, so Show, the Prompt Book and Busk take it too, and on those three it differs
from the `ShowBar`'s own `@[440px]:px-4` by 4px, deliberately. Every chrome row is 40px and holds
32px controls, so the inset is 4px everywhere: row A, row B (`h-10`, `min-h-10` when folded), row
C (`SelectionBar`), the rail header and the strip's chevrons, all level. Three control tiers by
nesting, and nothing else: 32 for a control on a row (`h-8` / `size="sm"`), 28 for a control inside
a control (`h-7`: Update and Revert in the source box, a template chip, `New`), 24 for a toggle
item, 20 for a pill. The header is 48px (`px-3 py-2`) at every height, not only under 500. 8px
between controls on a row (`gap-2`), 6px inside a control. Row B's filter is a field from 360px of
row B up, says `Filter…` (`FIXTURE_FILTER_PLACEHOLDER_SHORT` — a placeholder cannot switch by
container query, and the two plain list routes keep the long form) with the whole hint on its
`title` and `aria-label`, and takes the row's slack before the spacer does (`flex-[999_1_0%]`
against the spacer's `flex-1`; the folded arm keeps plain `flex-1`, since there the spacer is
hidden). The key button is not drawn in layer scope — ownership tints are off there, so there is
nothing to explain — and `ScopedKeyPopover` holds the ownership key only. Two phone-arm folds
below `@[600px]`: the source box becomes `Q4 · Update · Revert` with the name and change count
hidden and the dirty state an amber dot on Update (count on its tooltip; a Look keeps its families
badge, being its only name there), and the fade trigger keeps its value and drops only its chevron
(86 → 48px); in layer scope the layer pill is capped at 120 and `Unsaved` / `Saving…` fold to a dot
on it with the word `sr-only`, while `Save failed` keeps its word at every width. The three
measured floors in `ProgrammerGrid` (`min-w-[min(410px,100%)]`, `@max-[739px]`, `@[840px]`) were
derived from a 285px iconic action bar and now carry ~38px of slack on the phone; move all three
together against 852×393 and 945×457, or none of them.

Things that will bite:

- **The grid must never remount on a scope change.** `useListSelection` clears its Redux scope on
  unmount, so a conditional mount or a `key` per scope silently discards the fixture selection
  Record scopes on. `ProgrammerPage.test.tsx` asserts `gridMounts` across a switch; that is the
  load-bearing test of the whole session.
- **A scope switch drops the marquee to its rows, it does not clear the selection.** The cells are
  scope-local and must go, but since the two selections became one (§One selection, two shapes) the
  rows had been cleared when the cells were selected — so clearing the cells outright emptied
  `selectedRowIds`, the desk bridge published `set([])`, and every other screen's target band and
  family pill went dark. `FixturesListContainer` converts instead, through the same row door every
  other row gesture uses, so the heads survive everywhere and only the mask is dropped: the reading
  the bridge already gives a mask another window made. **Never publish an empty selection the
  operator did not make.** Two things ride on that conversion. It **closes any open cell editor**,
  in a second effect and explicitly — the old clear did it by accident, by taking `selectionEmpty`
  across its false→true edge, and rows that survive keep that flag false; an open popover's fields
  are not disabled by a read-only scope (only the cell's trigger is) and `useCellWriters` has no
  Output arm, so a commit from a stale panel lands literals in Local. And the **conversion effect
  must stay declared above `useDeskSelectionBridge`**: effects run in hook order, and that is what
  makes a scope switch and a `selection.state` frame arriving together resolve with the desk
  winning.
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
- **A focused template layer is a read, never an edit**, and the two kinds read differently. A
  **value** template shows no rows at all: projecting its generic row onto every targeted row would
  silently convert it to a per-fixture one on the first edit, which is a change to what the template
  *is* made by someone adjusting a value. An **effect** template shows the **live** value on the
  cells it drives — ringed by `layerCellClass`, with the wave and the division in `FixturesTable`'s
  bottom-right corner slot (free there, because ownership is switched off in layer scope) — since an
  effect is one rule for every head and what is worth watching is what it is producing now. Per-element
  Look rows stay out too; all three cases are named in `LayerRowNotices` (`FU-LOOK-ELEMENT-ROWS` for
  the last).

  `LookRowStore` engages **only for a LOOK layer**, so a template layer's answer comes from its
  sibling `FocusedTemplateLayer` — one context above the grid, read by `useScopedRowValues`,
  `LayerRowNotices`, `ProgrammerScopeBand`, `AddToTargetsButton` and `FanPopover`, because that
  hook runs per row and a query in it would be a subscription per visible row. Until that arm
  existed the layer scope fell through to *no* states, which the grid renders as live editable cells
  writing straight to Local while the band overhead says "One layer" — the notice had been claiming
  the opposite since it shipped.

  **"Read-only" has to be said in four places, not one.** `CellState.editable` reaches only the
  pointer (`pointer-events-none` on the wrapper); the cell trigger stays tabbable, so `PropertyCell`
  takes `disabled` from it too; `FanPopover` — which writes through `useCellWriters` from the
  toolbar, nowhere near a cell — gates on the focused template as well; and the marquee's
  **keyboard** (the Enter/character arm of the grid's window handler, §The programmer's keyboard)
  gates on `cellKeyboardPermission`,
  because the marquee itself arms in every scope — its `pointerdown` sits on the rows wrapper and a
  read-only cell's `pointer-events-none` only retargets the press there. A commit through any hole
  is not dropped: `useCellWriters` has no arm for a template layer, so it falls through to a **live**
  write and puts literals in Local. The Fan gate is on the *template* case only, not on layer scope
  generally: a focused Look layer has a row draft and the fan correctly lands in it — and the
  keyboard makes the same split, taking a typed value into a Look layer's draft and refusing it on
  a template layer and in Output.

  An untargeted row in a template layer is painted dashed like any other, so `AddToTargetsButton`
  reads whichever layer context is live — it is the only way a layer widens, and a tone with no way
  out of it is worse than no tone.

  `+ Effect` is disabled on a focused template — not D7 any more, but because a template holds
  **one** thing, chosen when it was made: there is no second effect to add, and adding a first
  to a value template would flip its identity.
- **In Output scope every tint is a destination**: clicking a cell jumps the scope to whatever won
  it. Three guards, and the middle one bites — `ProvenanceEntry.layerId` is present for a **cue's**
  layers too, so `focusLayer` checks membership in the programmer's own stack and reports failure.

**The FX band's row is two lines**, because one could not hold it: name, tempo and division with
the menu on the first, and property, **target** and home on a wrapping second. It was one flex line
of `shrink-0` chips in a 404px rail, so the name — the only thing allowed to give — was squeezed to
nothing and the menu button was pushed past the rail's edge; a `@[320px]` on the home detail was
meant to hide it narrow but the nearest `@container` is the whole workspace. The target is new:
`ActiveEffect` is one instance per target, so eight loose heads under one chase are eight rows, and
the key is what tells them apart. Only the layer *position* is written out beside the home badge;
the other two details ride the badge's title.

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
switcher. `components/SpeedMasters.tsx` is the desk's performance surface, with **two hosts**
since `PD-SPEED-OVERLAY` — the ShowBar, and the Speed Masters *overview panel* that reaches the
bank from a view with no bar (see §Navigation Registry) — and it shows
**every** master, master 1 included. It used to render 2..N on the reasoning that the
ShowBar's own BPM tile *was* master 1; that tile is gone, and the split was the width bug —
two thresholds fired at 560px in opposite directions, so between 560 and 900px the tiles and
the transport left the live-state block nothing and its cue numbers spilled. Don't
reintroduce it: the component's docblock is the record of why. It picks one of three arms
from the bar's `@container` width **and** the master count (`ARMS.shared`, because a container
query cannot see how many masters there are): a named tile each, one railed tile with a pill
per master, or `SpeedMastersChip` at the bottom.

**A host states one thing — `room` — and it picks a width ladder, not an arm.** `ARMS.shared` is
the bar's and `ARMS.dedicated` the overview panel's. The bar's thresholds were never about whether
the tiles *fit*: a tile is ~150px and every one of them comes out of the live-state block, the only
`flex-1` item on that row, so 1600px for four masters is what they cost the cue numbers beside
them. A panel owns its row and is competing with nothing — measured, four masters are 464px of
tiles at a narrow container and 711px at a wide one — so it tiles from 620px and rails from 240px
instead of 440px. 620 rather than something rounder because 788px is a real panel: what a
landscape phone at 852 leaves after the rail. Each dedicated threshold is sized against the tile's width *at* that threshold,
since the tile grows with its room; a flat per-tile figure is wrong at both ends. **The 5+ ceiling
does not move**, because that one was never a width judgment. What a host must never gain is an
*arm* of its own — its own readout, tile or ladder shape — which is how the split brain comes back.
No dedicated threshold may equal its rail width: the chip's hide class and the rail's show class
are a min-width pair at one breakpoint on one element, at equal specificity, so Tailwind's utility
sort would decide it. Write no container-query class in prose, here or in a comment — Tailwind
scans comments, and a placeholder in that shape is emitted as a real rule that fails the build in
`lightningcss`.

**Which master the rail is showing is a `createSyncStore` singleton**, not `usePersistentState` —
the same move `useVisSource` made, for the same reason and now for a second pair of surfaces. Two
mounted hosts each read the key once in a `useState` initialiser with no storage listener, so they
drift the moment one writes, and here the drift is not cosmetic: the selected master *is* the tile,
so its TAP and click-to-edit BPM are the controls on screen, and a press in one host would retune a
master the operator is reading in the other. The key is unchanged (both paths decode with the same
`JSON.parse`), so desks keep the master they were on. `SpeedMasters.test.tsx` mounts both hosts and
pins that they move together; the store is exported so a suite can `reset()` it, because a
module-level cache outlives `localStorage.clear()`.

**The count of surfaces offering TAP and click-to-type stays at four.** The overview panel mounts
`SpeedMasters` whole — the same `MasterTile` and `MasterRow`, not a copy — so it is one of the
four relocated, never a fifth.

**A master can also declare a `usage` and follow another master.** Both landed with the busking
view's speed-master work, and both are edited only in `SpeedMasterDetailSheet`:

- **Usage** (`dimmer` / `colour` / `position`) is the **apply-time routing default**. An effect
  created with no explicit master is *stamped* with the usage-matching master's uuid at the moment
  it is created — `useSpeedMasterForCategory` in `store/speedMasters.ts`, the rule itself in
  `lib/speedMasterModel.ts`. Nothing resolves usage later, and `null` still means master 1
  everywhere; that invariant does not move. **Its caller is `TemplateEditor`**: an effect template's
  master is stamped when the effect is chosen, so a Colour effect template picks up the master whose
  usage is `colour` without the operator being asked. The hook spent a while with no caller at all —
  the busk view's ad-hoc effect pads were the original one, and they went when that view was brought
  back onto its design — and was kept for exactly this. Every other half of the rule stands: a master
  declares a usage, the detail sheet sets it, `BuskSpeedRail` badges it.
  Usage is unique per project (the server 409s `SPEED_MASTER_USAGE_TAKEN`), and `controls` and
  `composite` are deliberately not routable — those land on master 1, which is what an unmatched
  category is defined to do. `speedMasterModel.test.ts` pins the vocabulary against
  `EFFECT_CATEGORY_INFO` the way `maskPicker.test.ts` pins the family lists.
- **Follow** (`followNum` / `followDen`, both null = manual, plus `followTargetUuid`) makes a
  master run at `leader.bpm × num/den`. The server owns that arithmetic *and the timing*: a
  follower's clock is **driven** by its leader's tick, so the two beat together rather than merely
  running at proportional speeds — say that, not "derives its tempo", when explaining the switch.
  Live values arrive as ordinary `speedMasters.changed` frames, so **this side never computes a
  follower's live tempo**, only previews and labels. Master 1 itself may never follow, so the
  sheet hides the control for it rather than disabling it.
  - **`followTargetUuid` is the leader; null means master 1** — the spelling every row written
    before targets existed carries, and the one the sheet sends when master 1 is picked, so
    "master 1" has two representations and comparisons must normalise (see `canonicalTarget` in
    the sheet). Chains are legal (M3 → M2 → M1) and loops are refused server-side
    (`SPEED_MASTER_FOLLOW_CYCLE`), which is why the picker filters through
    `eligibleFollowTargets` — self and descendants excluded — rather than letting the operator
    discover the rule by hitting a 400. Every read-only surface names the leader through
    `leaderLabelOf` / `leaderNameOf`: a bank prop is threaded to each of the four so a follower
    of M2 never reads "follows M1" — **including in its `aria-label`**, which is where three of
    the four kept saying "Master 1" after the visible text was fixed.
  - The REST row carries the **stored** target; the WS live frame carries the **resolved** one.
    They normally agree — a forced delete of a leader unlinks its followers server-side, so no
    route leaves a row naming a master that is gone. They can still diverge on a row no route
    wrote (an import, a hand-edited database): the bank degrades a dangling or looped link to
    manual while the row still advertises it, so the manage page would show a follow badge for a
    master the desk is running manually and a ratio-only PUT on it would 400 with
    `SPEED_MASTER_FOLLOW_TARGET_UNKNOWN`. Prefer the live frame wherever the question is "what
    is the desk doing".

**A follower's tempo cannot be typed or tapped, and exactly four surfaces offer those:**
`MasterTile` and `MasterRow` in `components/SpeedMasters.tsx`, `SpeedMasterRow` in
`routes/SpeedMasters.tsx`, and `MasterCard` in `components/busking/BuskSpeedRail.tsx`. All four swap
TAP for the ratio and stop opening the draft. Those four are now all of them: the fifth, an
unarmed master-1-only TAP in `EffectsOverviewPanel`, went when that panel did.

**The busk rail is the second surface that can *write* a follow ratio**, after
`SpeedMasterDetailSheet`; its five chips retune a link that already exists. Both write it the same
way and must keep to both of the sheet's rules: **both halves of the pair or neither** (a half-patch
is a 400), and **never `bpm` beside them** — the server refuses that combination on a follower,
whose tempo comes from its leader rather than from a stored default. The chips deliberately send
**no `followTargetUuid`**: they retune an existing link, and a ratio-only patch carries the stored
leader forward server-side, so sending one would let a chip press re-point the link. Linking and
*unlinking* stay in the sheet, where the choice can be labelled; retuning a link mid-show is the
half that belongs on a performance surface.
`speedMasters.error` is the backstop for writers with no affordance to remove (a MIDI surface, a
script, a stale tab); `store/speedMasters.ts` toasts it, keyed per master so a burst of hardware
taps replaces rather than stacks.

Two traps in that area:

- **`speedMasterLive`'s field-wise merge must copy every new field.** It writes named fields into
  the Immer draft rather than replacing the array (so a bpm push doesn't churn tile identity), so
  a field it forgets is written once from the first frame and never again — a usage retagged in
  another tab would leave this one routing to the old master for the life of the page.
- **Usage and follow ride `speedMasters.state`, not `.changed`.** The change frame is the tempo
  push and says nothing about routing.
- **Never render a link PUT's response `bpm`** — it is the pre-link stored value beside the ratio
  it just accepted (`FU-SPEED-LINK-PUT-STALE-BPM` in lighting7). The state frame corrects it.

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

### Windows, full screen and the hand

**A window is a socket carrying a client-minted identity** (multi-screen plan D9, D10; lighting7
d774fd9 is the wire, and where it and the plan's §3.4 sketch differ, the commit wins).
`lib/windowIdentity.ts` holds both halves in **`sessionStorage`, never `localStorage`** — the two
desk screens are two windows of one browser profile, and `localStorage` is one value per origin per
profile, so an identity kept there would be one identity for both screens. `windowId` is a uuid
kept for the tab's life once minted — a reload keeps it, and only a `?window=` boot mints a fresh
one, even over storage a cloned context inherited (its own bullet below); the name is
`?window=Screen%202` from the launch URL, read
once at boot before the router is created (`main.tsx`) and stripped, else *Window* plus a suffix,
and it can be renamed (`renameWindow`, a subscribable so the chip, the user menu and the announce
all move). Three things about the registry (`api/windowsApi.ts`, `store/windows.ts`):

- **The announce carries exactly `windowId`, `name`, `view`, `fullscreen`, `follows`.** The desk's
  Json is bare — no `ignoreUnknownKeys` — so one extra key makes the whole frame undeserializable and
  it is dropped with a server-side log line only. The symptom is a window that never appears in
  `windows.state`; `windowsApi.test.ts` pins the key set, and `id` and `user` are the server's to
  say. It goes out on every `Status.OPEN` (the second legitimate `open` re-send, §Where a WS bridge
  subscribes) and on every change — route, full screen, follow, rename — from one effect in
  `useWindowsBridge`. It is **handled only once the show is warm**: the frame waits in the socket's
  incoming channel through boot, so `windows.state` arrives empty behind the boot overlay and fills
  itself when the show is ready. There is no retry timer; do not add one.
- **The row's `id` is socket-minted and is what every command addresses**; the `windowId` is how a
  tab recognises its own row (`thisWindowRow`, first match). A duplicated tab copies its storage, so
  two rows can share a `windowId` and cannot be told apart from this side — D9 accepts that, the
  Screens sheet shows two rows, and `FU-WINDOWS-OWN-ROW-ID` is the exact fix.
- **`?window=` at boot mints a fresh `windowId`; a reload keeps the one it has** (session 2.5).
  `sessionStorage` is *cloned* into a top-level context created from an existing one — a
  `window.open` without `noopener`, a `target=_blank` link — so a second desk screen can wake up
  holding the first's id. A window is never told its own row, it *infers* it by matching `windowId`,
  so both screens would match both rows and the chip would read *Desk* — "I moved it" — when the
  twin moved it. The parameter means "a deliberately-named new window", which is exactly the signal
  that this context is not a continuation of the storage it woke up with; presence of the key is
  the signal, a blank value included, because a shared identity is the worse failure. The invariant
  on the other side is the regression to watch for: the parameter is **stripped** at boot, so a
  reload carries none and keeps its id — minting there would churn a registry row on every refresh.
  Both facts are read through one memoised `consumeLaunchParam`, because `main.tsx` calls only
  `windowName()` and the URL is rewritten by whichever of the two asks first. The **name does not
  follow**: a stored name still beats the parameter, so a `?window=` boot over cloned storage is a
  fresh id under the inherited name — two rows sharing a *name* is what D9 already accepts, and
  only the shared *id* was the misattribution. A window opened by the Screens sheet goes out with
  `noopener`, which per spec makes it a new browsing-context group rather than an auxiliary one and
  so should not clone at all — **still asserted from the spec, not observed**: the desktop app's
  Chromium preview pane creates no child context for any of the three routes (`window.open` plain,
  `window.open` with `noopener`, a `target=_blank` click), converting each into a navigation of the
  *current* tab, so neither route could be shown to clone there. What that pane did show is the
  same-tab half of the rule: each of those `?window=` navigations minted a fresh id and kept the
  stored name. The clone itself is the desk's to see, on a tray item, a Dock app or Safari.
- **Every socket receives every command, the sender included** (D11), so each handler's first act
  is comparing `targetId` to this window's row id, read at command time from the last state frame
  — which is also what makes this window's own `show` for another window a no-op when it comes back.
  `windows.show` is a `navigate(view)`: the show-editing lock is per tab and defaults locked, so
  `/show` lands locked; an open cell editor unmounts with its route and the desk bridge never
  publishes on unmount; and a **guarded sheet declines** — the toast names the view and carries a
  button that goes. `windows.rename` is **not applied server-side**: the target renames itself and
  re-announces, which is what makes the name survive that tab's reload, so a rename aimed at a
  disconnected window changes nothing, exactly as a show does (`FU-WINDOWS-SHOW-OFFLINE`; do not
  retry). `windows.fullscreen {on:false}` calls `document.exitFullscreen()`; `{on:true}` cannot call
  `requestFullscreen` without a gesture and raises the *Return to full screen* banner instead.

**Full screen** (`lib/fullscreen.ts`, plan §3.6): `requestFullscreen` on the document element from
a gesture — the user menu's item, ⇧F, the ⌘K command, the Screens sheet's button — then
`navigator.keyboard.lock(['Escape'])` **feature-detected**, so on Chrome at a secure origin Esc
reaches the sheet's clear-selection rather than the browser, and on Safari it quietly does not. A
`fullscreenchange` listener is the truth (Esc, a tab switch and another app all leave without
telling the requester), and it keeps a `sessionStorage` flag so a window that was full screen and is
not now — a reload, a crash, a `{on:true}` from another screen — draws the one-tap banner at the top
of `<main>` (`ReturnToFullscreenBanner`, beside `SyncReauthBanner`). In full screen the app draws a
small exit glyph on the user menu's label line and nowhere else — never a floating button on a live
view. **Safari on the Mac is a first-class desk browser (D13)**: every Chrome-only piece — Keyboard
Lock, `getScreenDetails`, the *Open a window on… Display N* row and the *Open <view> on another
display* commands — is feature-detected and its absence is *quiet*: no item, no gutter, no disabled
control saying "use Chrome".

**The one rule underneath all of it is the secure context** (`lighting7/docs/desk-screens.md`):
installation, Keyboard Lock and Window Management exist only on a potentially-trustworthy origin,
and the desk serves plain HTTP — so the two desk screens must be opened at `http://localhost:8413/`,
and the iPad at the `.local` name gets the Fullscreen API and nothing else. Nothing in the UI says
so; a desk screen whose Esc keeps leaving full screen has almost certainly been opened at the LAN
name. `public/manifest.webmanifest` (`display: fullscreen`, `display_override: ["fullscreen",
"standalone"]`, no service worker) plus `<link rel="manifest">` and `apple-mobile-web-app-capable`
in `index.html` are the whole of the install story; its icon is `public/icon.svg`, a placeholder
until `FU-DIST-ICONS` — the `/vite.svg` favicon link it replaced pointed at nothing.

**The Screens sheet** (`components/screens/ScreensSheet.tsx`, `Screens.dc.html` §2) is mounted once
in `Layout` and opened from the user menu and from ⌘K through `screensSheetState`, since neither
opener is an ancestor of the other. Every write on it is a `windows.*` command by row id — this
window's included, so a rename of this tab goes out and comes back like any other and there is one
path, not two. *Copy link for another device* mints `<origin>/?window=<name>` with the space as
`%20`, the launcher's spelling (`DeskScreens.screenUrl`); the origin is this tab's, because the desk
mints its LAN address server-side per request and exposes it on no GET route, so a tab at
`localhost` copies a link that names the desk to itself and says so under the button
(`FU-SCREENS-LAN-URL`). **Layouts** is `FU-SCREENS-LAYOUTS`, not built. **The hand** is session 3.

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
  which holds Log out and the **theme toggle** — the latter since `PD-SPEED-OVERLAY`
  added a ninth icon button to the app header and the row stopped fitting a phone
  (nine controls came to 439px against a 375px viewport, and the avatar was what got
  pushed off). Theme went because it is the one thing on that row that is not a desk
  control but a per-*viewer* display preference, which is what the rest of this menu
  is. **On a bootstrap-open desk the menu still opens**, behind a generic glyph, with
  the per-viewer items — the theme, *Full screen*, *Screens…* — and no account items:
  it used to return a bare `ThemeToggle` there, which kept the theme reachable and
  quietly lost the other two the day they were added. That standalone button is
  deleted; `ThemeMenuItem` is the one theme control, and the theme is
  a `useState` seeded once from storage, so a second mount would drift. It is
  deliberately **not** on `syncStore`, which JSON-encodes: `theme` is stored
  as the bare string `dark` and read at module scope in `main.tsx` before React exists. Four tabs — **Profile / Password / Devices /
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
- **The lock is the cue sheet's read-only scope** (§Sheet kit): locked, the sheet's value cells
  are inert and a click on the Cue column arms the cue as next, exactly as a card's body click
  does; `useTransportKeys` keeps its `enabled: locked` and now stands aside from a key another
  handler has already claimed, which is how a name typed into a cue cell beginning with `l` does
  not toggle the lock.
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

**One `ShowBar`, identical on the three live views that have one.** Every host spreads
`showBarProps` from `useShowBarProps` and overrides exactly one prop — `showShortcuts`, which
advertises keys and so can only be answered by the host that binds them. Everything else comes from
the hook, which is what stops the bar drifting into three near-copies: it previously had no Blind on
the Prompt Book, a different stack-name rule on Show, and a hand-wired transport on the Prompt Book
that gave that page two transport instances.

**The programmer is the exception, and draws no bar at all.** It keeps `ShowHeader` — the breadcrumb,
the save pill, the view switcher, Start/Stop and the live dot — and nothing below it until row A.
That is the space plan's session 5, and it is *not* what D9 proposed: D9 was to fold `ShowHeader`
into `ShowBar` on all four views, which was built and then rejected at the desk in favour of this.
The reasoning is D1 applied to a band rather than to a row — everything above the grid earns its
place by the line, and ~60px of blackout, tempo, cue numbers and transport is the largest thing on
that page that is not about editing values. Three consequences, each of which reads as a bug if you
do not know it is a decision:

- **Blind is toggled on the programmer, and only there; blackout is gone outright.** Blind is a
  *programmer* fact, not show chrome — `ProgrammerSummary.blind`, written by `programmerSetBlind`,
  faded by the programmer's own fade — and session 5 leaving the programmer with no press was the
  one failed check of the desk pass (`PD-BLIND-ON-PROGRAMMER`). The control is the action bar's, in
  row A's Stage zone beside Clear and the fade picker; `useShowBarProps` supplies no `onBlind` **for
  any host**, so no bar draws a tile, and Show, Busk and the Prompt Book *report* it through the
  `ProgrammerIndicator` their bar already mounts. That is session 2b's arrangement exactly inverted,
  and the rule it was written for still holds: one control, one place. The drift to refuse now is
  the reverse one — a Blind tile back in the bar for one host. Do **not** make `ProgrammerIndicator`
  the toggle either: it is also the link to the programmer, and one control cannot be both without
  one of the two jobs becoming a surprise. It has no `blindShownSeparately` any more — the ShowBar
  tile was its only true caller, and a badge that can be told to stay quiet is one a host can silence
  with nothing else saying it. On the programmer the header's badge and the action bar's button are
  both amber when blind: the reporter and the control, one row apart.
- **GO and BACK are not on the programmer**, which binds no transport keys either
  (`useTransportKeys` is Show's and the Prompt Book's). The switcher in the header is one pill from
  three views that do have a transport.
- **The speed masters are not *resident* on the programmer**, and `PD-SPEED-OVERLAY` did not put
  them there: the bank is summoned from the app header's **Speed Masters overview panel**, which
  hangs over every route and is nobody's view chrome — the programmer gained nothing of its own.
  `ProgrammerFxList` still names each effect's master, and `/speed-masters` still manages the bank.

`ProgrammerPage.test.tsx` pins the absence; `ProgrammerPage.tsx`'s note beside the header is the
long form of all three.

- **The bar is not gated on the show running.** It carries blackout, the speed masters and the
  programmer chip, all of which mean something with the show down, and `goDisabled` already mutes
  BACK/GO. Gating it was what once made **Blind's location depend on the show's state**.
- **Blind is not in the bar.** From session 2b to `PD-BLIND-ON-PROGRAMMER` it was, beside blackout,
  on the reasoning that the two are the same class of thing (a gate on what reaches the rig) — and
  that put the press on the three views whose programmer is usually empty and off the one whose
  whole subject it gates. See the programmer bullet above for where it is now. The fade survived
  both moves and must survive any next one: `lib/programmerFade.ts` is a module-level store, not a
  `usePersistentState` per reader, because as two instances of one key it was two mount-time
  snapshots, and Blind snapped for the rest of the visit. The action bar's Blind and Clear read one
  subscribed value from it; the marquee's Backspace reads it at press time.
- **DBO is still inert** in every host — local state, no side effect
  ([`FU-FE-DBO-INERT`](../lighting7/docs/plans/followups.md)). It no longer has a working Blind tile
  beside it to read as a peer of, but a tile that does nothing is still the part that must not stand.

**Browsing a stack never moves the playhead.** A tab click used to run
`deactivate(old) → goToStack → deactivate(target)`, so one unconfirmed press took the live cue off
stage and repositioned every other client. `StackTabStrip` now takes `selectedStackId` (the underline)
and `liveStackId` (the green pip) as separate props, and arming is an explicit, confirm-gated control
in `OffPlayheadBanner`. The confirmation is not ceremony: `POST /show/go-to` deactivates the stack
being left and then calls `activateAtFirstCue` on the target, so the target's first cue genuinely
fires and the desk darkens it again — a visible blip on top of losing the current cue.

**And the Stacks button has to be able to leave one.** `/show`, `/show/stacks/:id` and
`/show/stacks/:id/table` are three sibling routes with an `element` each, so going back from a stack
**remounts** `ShowPage` — which reset the `initialDrillDoneRef` that makes the "drill into the live
stack on arrival" auto-navigate fire once, and the auto-drill put the operator straight back where
they had just left. A ref cannot say "they asked for the list" across a remount, so the signal rides
the *location* instead: `STACK_LIST_STATE` on the Stacks button's and the breadcrumb's navigate, read
by that effect. Do not replace it with a ref or a module-level flag — the first cannot survive the
remount and the second would suppress the auto-drill for the rest of the tab's life.

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

**Expansion is the operator's cards plus the playhead's, derived.** `useCueExpansion` owns one
rule — there are two reasons a card can be open, and closing must silence both — and leaves the
operator's slot to the caller, because its storage and multiplicity genuinely differ: Show keeps one
cue in `?cue=` (an external contract; the Prompt Book mints those links), while the Prompt Book rail
keeps a set in local state so two cues can be compared against the page they anchor to. The rail
also auto-opens the cue on deck (`nextCueId`), which Show does not. Either way a GO opens the new
playhead cards and cannot take away one being read, because nothing in the hook writes the
operator's slot. Run kept a `Set` and never removed from it (five GOs, five open cards); Show kept a
bare scalar a GO would overwrite. Dismissed playhead cards self-clear as their ids stop matching;
`resetKey` exists for the one id that survives a transition — a dismissed *next* card the GO makes
live.

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
  a row marquee and a cell marquee, and its selection is Redux-scoped to one of three scopes.
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

The census as of this writing, so a new slice can see which company it is in: **27 module-scope
sites across 20 slices** (`grep -n '^lightingApi\.' src/store/*.ts`), and **four deferred**, all
started from `main.tsx` — `oauthGithub`, `looks`, `templates`, `programmerErrors`. The imbalance is
the rule working, not drift: form 1 is the default and form 2 is the exception, and the four are
exactly the slices the sidebar and the first paint reach. `store/windows.ts` is on the sidebar's
path too (`UserMenu` reads the window count) and is **neither**: its only subscription is form 3, a
`queryFn` that closes over `lightingApi` and touches it when the first reader mounts, so it needs no
`startWindowsBridge()`. The half of that family that turns a frame into an action — the announce
and the three command handlers — lives in a hook (`components/screens/useWindowsBridge.ts`, mounted
once in `Layout`), because it needs the router's location and `navigate`, which exist only inside
`RouterProvider`.

Nothing is being migrated toward form 2. `import/no-cycle` is an ESLint **error** in this repo, so
the precondition for the TDZ hazard — an import cycle through `api/lightingApi` — cannot reappear
silently; the four deferred bridges stay deferred as defence in depth for the render-order half,
which the lint rule does not see.

**There are two legitimate `open` re-sends, and both re-send what the *server* forgot.** The
first is `speedMastersWsApi`'s beat requests, which live on the server's per-connection scope. The
second is `windows.announce` in `api/windowsApi.ts`: the desk's windows registry keys its rows by
socket, so a reconnect is a new socket with no row until this tab says again what it is. That
branch re-sends the last announce and nothing else — no `windows.state` request, since the desk
pushes the snapshot on every connect — and it is the frame that carries the window's name, which is
why `api/selectionApi.ts` still has no `open` branch and never will: a `selection.set` on connect
would be a *write* that replaces the desk's selection and makes a reconnecting tab its last mover.

## Patterns and Conventions

### State Management
- Use RTK Query hooks (`useXxxQuery`, `useXxxMutation`) for all API interactions
- Queries auto-subscribe to WebSocket updates where relevant
- Avoid local state for data that should be synchronized with the backend

### Components
- Route components in `src/routes/`
- Shared/utility components in `src/`
- Use Radix UI primitives (via `src/components/ui/`) and Tailwind for UI

#### What may live in `routes/`

`routes/` is not "anything page-shaped" — it is one module per **routed resource**, and the
convention has three parts. It is worth stating because the tree looks messier than it is: most
modules export a page *and* one or two redirects, which reads like drift and is not.

1. **A module owns a resource, and everything that resolves that resource lives in it.** So
   `Fixtures.tsx` exports both `ProjectFixtures` (the page) and `FixturesRedirect` (bare
   `/fixtures` → the current project's fixtures). The redirect is part of the resource: it answers
   "which project?", not "where did this view go?".
2. **A former route that became a settings tab keeps its module and its identity**, exporting the
   tab body alongside the redirect that survives its old path — `Surfaces.tsx`, `CloudSync.tsx`.
   This is the uniform pattern, not a stray. The test is whether the module is still *routed*: if
   nothing in `App.tsx` renders it, it is a component, not a route, and belongs under
   `components/<feature>/` — which is where `RiggingsContent` and `StageRegionsContent` went.
   `Patches.tsx` was this pattern's third example and is rule 1 again: the patch list is routed at
   `/projects/:id/patches` since the list shell (§List shell), and the module exports the page
   (`ProjectPatches`) and its bare-path redirect.
3. **A redirect for a path that no longer names a view goes in `routes/legacyRedirects.tsx`**, not
   in whichever module happens to be its destination. `/run`, `/cue-stacks`, `/cues` and `/program`
   all land on `/show`, and `/fx` lands on `/busk`; collecting them keeps `ShowPage.tsx` from
   accumulating four unrelated histories, and keeps `/program` out of `ProgrammerPage.tsx`, where
   it reproduced the `/program` vs `/programmer` confusion in the file layout.

   The line between rules 1 and 3 is what a redirect *answers*. `BuskRedirect` lives in
   `Busk.tsx` because it answers "which project's busk view?" — part of the resource.
   `LegacyFxRedirect` lives here because it only answers "where did `/fx` go?".

Anything else — a pure helper, a shared type — belongs in `lib/` even when only one route uses it
(`formatRepoUrl` was exported from `CloudSync.tsx` until it moved).

**Redirect targets are frozen.** `?cue=` deep links are an external contract minted by the Prompt
Book's "Edit cue" card, so a redirect that carries `search` must keep carrying it, and no legacy
path may quietly change where it lands.

### Navigation Registry
- All navigation items are defined in `src/navigation.ts`
- When adding a new page/route, add an entry to the `navItems` array in `src/navigation.ts`
- This automatically registers the page in both the sidebar and the Cmd+K command palette
- Dynamic items (e.g. universes) are handled by the `useUniverseNavItems()` hook (`useNavItems()` just returns the static `navItems`)
- **The ⌘K window commands are actions, not `NavItem`s.** `useWindowCommands()` in
  `src/navigation.ts` builds ⌘K's *Screens* group from the windows registry the way
  `useTemplateFamilyNavItems` builds its four from the family list, and `buildWindowCommands` is the
  pure half `navigation.test.ts` pins: *Go full screen* / *Exit full screen* (⇧F, absent where the
  browser has no Fullscreen API), *Screens…* with the window count, *Show <view> on <window>* for
  every **other** window × the six views in `lib/windowViews.ts` (this window has the Navigation
  group already), *Open <view> on another display* (Chrome only, absent elsewhere — D13's rule that a
  missing feature is quiet, never a disabled row saying "use Chrome"), and *Follow the desk selection
  in this window* with its state as the detail. They carry a `run`, not a `path`, because most of
  them move *another* window; the sidebar never lists them.
- **Exception — cards/list sibling routes**: list views that pair with a cards
  view (`/fixtures/list`, `/groups/list`, `/channels/:universe/table`,
  `/show/stacks/:stackId/table`) deliberately have **no** `navItems`
  entry. They're reached via the in-page Cards/List switcher
  (`src/components/ViewSwitcher.tsx`) and Cmd+K item deep links, and the
  sidebar keeps one entry per resource; the cards route redirects to the list
  when the sticky view preference says so. Follow that pattern for any new
  cards/list pair instead of adding a second sidebar row.
- **There are four live views: Programmer · Show · Prompt Book · Busk.** The programmer is
  `/projects/:id/programmer` (`ProgrammerPage`); `/show` (`ShowPage`) is *both* the
  cue/stack authoring surface and the runner. `/program*` and `/run*` both redirect to
  the `/show` equivalent, and `/program*` **carries the search string**, because
  `?cue=` deep links are how the Prompt Book's "Edit cue" reaches a cue.

  **Busk is `/projects/:id/busk`** (`routes/Busk.tsx` → `components/busking/BuskingView`):
  the target band, the page the operator built and the speed rail, under the same `ShowHeader` and
  `ShowBar` as the other three, from the same `useShowBarProps`. The page itself is §The busk
  layout; this section is the route and the surface around it. It was `/fx`, which named
  the machinery rather than the job and sat one hyphen from `/fx-library` — the collision
  `lib/navMatch.ts` exists for. `LegacyFxRedirect` keeps both spellings of the old path
  alive; the nav entry keeps `id: "fx"` as its stable handle, the same call `program` made
  when Show was renamed.

  Four things about it that are decisions rather than detail:

  - **The pads are the *library*, and nothing else.** A busk pad presses a **named thing from the
    library** — a template, a Look or a cue — and nothing on this page mints one. The view used to
    draw three pools of ad-hoc effect pads besides, a Controls pool of hold-to-slide property pads
    writing straight to the programmer, and a beat-division toggle to parameterise whatever those
    minted; all of it went when the view was brought back onto its design, because a grid minting
    anonymous FX instances with their own timing model was a different gesture wearing the same
    clothes. Three things follow, and none is a bug:
    - **Nothing on this page mints an FX instance.** An ad-hoc effect reaches the stage through a
      Look with deferred effects, a cue, or the Programmer's `+ Effect`; a raw level through an
      intensity template or the Programmer.
    - **`useSpeedMasterForCategory` lost its caller here.** The effect pads were the only surface
      doing the busking plan's D1 stamping, and it is client-side — the backend serves `usage` but
      does not resolve it. The rail's caption was reworded off the promise it could no longer keep,
      and should stay reworded: nothing on *this* page stamps a master. The hook itself was kept
      rather than deleted, and `TemplateEditor` is its caller now (see §Speed Masters).
    - **`BuskingView` reads no target's running effects.** The eight fixed RTK Query slots that once
      fanned the selection out (and capped it at eight targets — `FU-BUSK-TARGET-CAP`, now retired)
      went with the pads. A template or Look pad reads the programmer's **resolved applied state**
      (`useProgrammerAppliedQuery`; the view does not subscribe to the layer stack at all), which
      needs only `{type, key}` per target, so `lookLayerTarget` is the one place the group-name
      convention is applied and the selection has no ceiling. A **cue** pad reads `useActiveCueIds`
      instead — its stack has that cue on stage, playhead or not, which is what makes a cue pad a
      toggle rather than a playhead move.
  - **It does not pass `canOperate`, and the show-editing lock is not consulted.** GO must
    work from a busk pad: busking *is* the live use, and the lock is a stray-click guard for
    editing surfaces rather than a transport gate — the same reasoning that keeps `locked`
    away from `canOperate` on `/show`.
  - **The target band replaced a sidebar, and a pad is a plain toggle.** `TargetBand` is two
    rows of pads in one `grid-flow-col` container, groups then fixtures, scrolling sideways
    — so the band's height is fixed at two pads whatever the rig size, and the width a
    sidebar spent permanently goes to the pads. The list it replaced was
    left-click-replace / right-click-toggle, which has no touchscreen gesture and no
    discoverable mouse one; `selectTarget` survives only for the narrow-width sheet, where
    picking one thing and getting one thing is right. `SelectedTargetSummary` went with the
    sidebar, and `Breadcrumbs`' `extra` / `onExtraClick` went with *it* — the busk view was
    their last consumer, so every breadcrumb trail is now `Projects > Project > <View>`.
  - **There is no empty-selection dim, and re-adding one would be a regression.** The pools used to
    grey themselves out with nothing selected. Three of the things a pad can now hold do not need a
    selection at all — a **per-fixture** template names its own heads, a Look with **no deferred
    effect** names its own fixtures, and a **cue** has no targets — and the two cases that genuinely
    need one are refused *by name* server-side (`TEMPLATE_NEEDS_SELECTION`, `LOOK_NEEDS_SELECTION`),
    which is a better answer than a grey page. A bank mixes kinds anyway, so the old per-section dim
    has nothing left to be per. The **target band** still dims, for the other reason: in edit mode
    pads do not press, so the selection they would press onto is doing nothing.

  **`look-groups-design/` in lighting7 is the layout authority** — `Main.dc.html` for play mode,
  `Edit.dc.html` for edit mode, `Layout.dc.html` for the rows/columns/banks structure and the three
  bank drop zones. It supersedes `busking-view-design/`, which drew the pools this page no longer
  has. Two conventions carried over and should hold for anything added here:

  - **One label, `BuskLabel`** (9px bold uppercase, wide-tracked, muted, **no icon**), on every
    region — band, palette, rail. Regions once drew a larger icon-bearing heading, which made three
    parts of one instrument read as three surfaces. It renders a `<div>` deliberately, so a test can
    reach a region's body by walking up from its label.
  - **The target band lives inside the left column**, so the rail's border runs from under the
    ShowBar to the bottom of the page rather than starting below the band.

  **Holding a speed-master card turns it into a tempo fader**, which is the busk view's own
  hold-to-slide gesture — the one the property pads carried before they were deleted. It is the
  third way to set a tempo and they do not overlap: TAP finds one you can hear, the number sets one
  you know, and the drag *trims* one that is nearly right, which is what a busking operator does
  most and had no gesture for. Six things:

  - **The whole card is the fader**, armed after `SLIDE_HOLD_MS` and seeded from the point the press
    started at, so nothing jumps when the hold takes. `useLongPress` hands `onLongPress` that
    origin for exactly this. The rest of the drag lives on **window** listeners — a fader is
    followed past the edge of the thing that started it — keyed on the `sliding` *boolean* and never
    on the dragged value, or every `pointermove` would tear the listeners down and rebuild them.
    They must listen for **`pointercancel` as well as `pointerup`**: the rail is a scroller with no
    `touch-action` of its own, so on a touchscreen a drag the browser reclaims as a pan ends with no
    release at all, and a card left `sliding` writes a tempo on the next pointer movement anywhere
    on the page with nothing held down. `useLongPress` cancels on it too, or the armed hold fires on
    a finger that is already scrolling something else.
  - **The travel is `SLIDE_MIN_BPM`..`SLIDE_MAX_BPM` (60..180) in `lib/speedMasterModel.ts`**, not
    the clock's 20..300. Deliberately the same window as lighting7's `BindingTarget.SpeedMasterBpm`
    and for its stated reason: a drag across the whole range spends most of its travel in tempos
    nobody plays at. It is a **control** range, not a limit — typing and TAP still reach the clock's
    ends. Don't "fix" it by widening it to the clock's range.
  - **It applies as it goes**, because that is what a fader is for: the tempo is judged by ear
    against a running show, and a control that only lands on release makes that guess-then-check.
    `useLiveTempoPush` is the traffic half of the same decision, not a softening of it — writes are
    deduplicated on the whole BPM and floored at `SLIDE_PUSH_MS` (50 ms), a deferred value is held
    and sent when the floor lifts rather than dropped, and the release bypasses both so the value
    let go on always lands. There is deliberately no optimistic pending value after the release,
    unlike the property pads: those waited on a REST refetch, and here the drag has been writing all
    along, so the desk is already at the value being released.
  - **`slideBpmRef` is written by the pointer handlers, never at render time.** A fast drag can
    dispatch a `pointermove` and the `pointerup` that ends it in one task, with no re-render
    between, so a ref assigned during render makes the release send the tempo from the move *before*
    last — silently undoing the operator's final movement. Found by a test, not by inspection.
  - **The click that ends a drag is swallowed** by an `onClickCapture` on the card calling
    `consumeLongPress()`. Capture runs root-to-child, so neither TAP, nor the bpm button, nor a ratio
    chip has to know the gesture exists — which is what lets the drag cross them freely.
  - **A follower cannot be dragged**, alongside its existing TAP and click-to-type refusals: the
    server refuses all three (`SPEED_MASTER_FOLLOWER`). Nor can any master while the desk is offline
    or its bpm field is open.

  **`SpeedMasterDetailSheet` is reached from the sliders glyph in the card's title row**, and only
  from there — the hold belongs to the fader, and a card cannot answer a hold two ways.
  `SlidersHorizontal`, not the footer link's `Settings2`: two identical glyphs a few rows apart read
  as one destination. The glyph is withheld until the REST row arrives, since the sheet edits that
  row rather than the live frame; the fader is not, because it needs only the uuid the live frame
  carries.

  The gesture itself is `hooks/useLongPress.ts`, which replaced two byte-identical hand-rolled
  copies; `PropertyPadButton` had a third (deleted with it), and `CueSlotOverviewPanel` adopted it
  too once its second stage — hold longer and the panel latched its own wiggle-and-cross edit mode —
  went. A slot's cross follows the **busk view's** edit mode now (`useBuskEditMode`), so what is
  left there is one stage: a hold opens the context menu, which is the only way to reach *View* and
  *Clear slot* on touch.

  **The cue column is gone, and a cue is a pad like any other.** There was a fourth region beside
  the Looks pool (`BuskCueStacks.tsx`): a card per runnable stack — name, live pip, current → next,
  Release, GO — and the **pinned cues** as pads below it. All of it went with the automatic layout,
  because a cue that wants a pad is now simply placed in a bank. What that decided, and what it
  costs:

  - **A cue pad is apply / stop, not a playhead move.** It presses through `POST /busk/pads/{id}/press`
    like every other pad, which reaches `CueStackManager` — so the cue goes live *without becoming
    the playhead*, exactly as a cue slot behaves, and pressing it again stops it. `useActiveCueIds`
    is what lights it, for the same reason. `GoToStackRequest.cueId` lost its only caller and is
    gone: `/show/go-to` names a stack and lands on its first cue.
  - **GO and BACK are the ShowBar's, and only the ShowBar's.** The stack cards' GO was two requests
    behind one gesture — `transport.go()` on the live stack, `goToStack` on any other — and a busk
    page has no room for a transport that means different things depending on which card it is on.
  - **`pinnedToBusk` is gone entirely** — the column, the *Pin to Busk* toggle in `CuePropsPane`,
    and the `buildCueInput` round-trip. A cue that wants a pad is placed in a bank.
  - **The transport is not a prop any more either.** `routes/Busk.tsx` still holds the one
    `useShowTransport` through `useShowBarProps` — a second instance would mean a second rAF loop
    and a second reconcile effect on one runner slice — but nothing below it needs one.

  **The Effects Overview panel is gone, and there are four overview panels now** — Stage,
  Fixture, Speed Masters, Cue Slots. Effects Overview held a beat dot, master 1's bpm, a TAP, a
  running-effect count and a
  Kill All, and `/fx` used to force it open and its toggle inert for as long as that route was
  mounted, because the busk view had no tempo readout and no view of what was running. Both
  halves of that reason expired: the ShowBar carries the whole speed-master bank on every live
  view, each tile with its own beat dot and TAP, so the panel was a second and narrower answer
  to "what tempo is the desk at" — narrower because it only ever spoke for master 1 — and the
  busk view has a speed rail and pad presence rings besides. **The count and Kill All were not
  moved anywhere.** What is running is listed, effect by effect and removable by name, in the
  programmer's FX band and in `ActiveEffectSheet`; a "stop everything" gesture, if it is wanted
  again, belongs beside blackout in the ShowBar rather than in a panel the operator has to open
  first. `store/fx.ts` (the `fxState` RTK Query wrapper) went with it — `api/fxApi` stays, since
  `store/groups.ts` still subscribes to the frame.

  **Speed Masters is the fourth, and it is not that panel returning** (`PD-SPEED-OVERLAY`). The
  difference is the whole of why it is allowed: Effects Overview drew a tempo readout *of its own*,
  narrower than the bar's; `SpeedMasterOverviewPanel` mounts `components/SpeedMasters.tsx` — the
  bar's own component, every master, unchanged — in a wider box, so it is the same answer reached
  from a view that has no bar rather than a second one. It hangs under the app header beside the
  other three, which is what makes it *every* view's and no view's: the programmer gains no chrome.
  Nothing came back with it — no count, no Kill All, no readout of its own — and no tempo is
  computed client-side; the live frame is still the readout, and master 1 and the follower rules
  are `SpeedMasters`' unchanged.

  It passes `room="dedicated"`, which is the only thing it tells the component — see §Speed
  Masters for what that picks and why the panel's thresholds are not the bar's.

  **Its visibility persists per panel and app-wide, which is a feature and a cost, and both are
  accepted.** Opened once it stays open on every view and across reloads: on the programmer that is
  a tempo band on screen, and on Show, the Prompt Book and Busk it is the bank drawn twice until
  dismissed. Neither is a defect and neither is session 5's band returning — the difference is a
  door the operator opened and can close. Do not "fix" it by making visibility per-view; that puts
  one surface in two states again.

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
- **Unsaved changes**: a guarded sheet asks *"Discard changes?"* before Escape, a click outside or
  the X take it away. There are **two ways to say a sheet is dirty, and which one you need depends
  on where you are**:
  - `<Sheet unsavedChanges={isDirty}>` — for the component that renders the `<Sheet>` itself,
    which is the common case (it usually owns the form state too).
  - `useUnsavedChanges(isDirty)` — for a component **mounted inside `SheetContent`**, which is the
    only place it works. It reports through a context `Sheet` provides, so a call in the component
    that *renders* the `<Sheet>` resolves against providers **above** that component and finds
    nothing: `register?.()` then no-ops and **the sheet is silently unguarded**. Four sheets
    shipped that way. It is a deliberate no-op outside a sheet entirely, which is why the mistake
    is invisible (`CueTriggerEditor` relies on that for its inline mode).

  The two combine, so a parent's prop and a body's hook can both contribute. `sheet.test.tsx` pins
  both directions of the trap. **Both also feed a module-level count**, `lib/unsavedSheets.ts`,
  which `Sheet`'s provider writes from the same `hasUnsaved` it guards on — gated on `open`, since a
  controlled sheet's `unsavedChanges` prop can stay true after the panel closed. It exists for one
  reader nowhere near a sheet: a `windows.show` from another screen declines to navigate while the
  count is non-zero (§Windows, full screen and the hand). A count and not a flag, because a picker
  can sit over an editor and the second closing must not clear the first's claim. Only a close **Radix** drives reaches the question, so a Cancel
  button must be wrapped in `<SheetClose asChild>` rather than calling the parent's own
  `setOpen(false)` — and must not also carry an `onClick` that closes, since `asChild` would run
  both. Only controlled sheets can be guarded — an uncontrolled one closes itself inside Radix.
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