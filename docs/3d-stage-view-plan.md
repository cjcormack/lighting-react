# 3D Stage View Upgrade — Multi-Session Plan

## Context

The existing stage view in `lighting-react` is a 2D top-down HTML/CSS layout
(`src/components/stage/StageMarker.tsx`, `src/components/StageOverviewPanel.tsx`)
with fixture positions stored as 0–100% of viewport on `FixturePatch.stageX/Y`.
The backend (`lighting7`) has already shipped the full 3D schema —
`FixturePatchDto` carries `stageX/Y/Z` (metres, Z-up, FOH-relative),
`baseYawDeg/basePitchDeg`, `riggingUuid`, pre-composed `worldPositionX/Y/Z`,
and there are CRUD endpoints for `Rigging` and `StageRegion`. None of those new
fields are surfaced on the frontend.

Goal: upgrade the React app to a 3D stage visualiser per
`/Users/chris/Development/Personal/lighting7/docs/research/stage-vis-discovery.md`,
delivered in independent sessions so each lands cleanly on its own. The
visualiser must:

- render stage geometry, rigging, and fixtures from existing REST data
- track live beam direction and colour from DMX (read via existing channel hooks)
- support visual editing of all three on tablet+ viewports, view-only on phones
- coexist with (toggle to) the current 2D view

## Decisions (confirmed)

- **Coordinates**: reset & start clean. Existing `stageX/stageY` percentages
  are dropped; fixtures are re-placed in the new 3D editor in metres.
- **Live DMX path**: reuse existing per-channel hooks
  (`useSliderValue`, `useColourValue` from `src/hooks/usePropertyValues.ts`).
  Each `<FixtureModel>` reads channels inside `useFrame` and applies pan/tilt
  + colour imperatively. No backend WebSocket changes needed.
- **2D view**: keep as fallback with a user-facing 2D ↔ 3D toggle on the
  stage panel.
- **Edit gate**: view on all viewports; editing enabled at `SM_BREAKPOINT`
  (≥640px). Use existing `useMediaQuery` from `src/hooks/useMediaQuery.ts`.

## Status overview

| Session | Title                              | Status      | Completed | Notes |
|---------|------------------------------------|-------------|-----------|-------|
| 1       | Foundation                         | Done        | 2026-05-03 | Cross-repo: backend now broadcasts riggingListChanged/stageRegionListChanged. Data reset dropped (no meaningful legacy data). |
| 2       | Stage Configuration                | Done        | 2026-05-03 | New "Stage" tab in Project Settings hosts stage dimensions + regions CRUD. |
| 3       | Rigging Configuration              | Done        | 2026-05-03 | Riggings CRUD on new "Rigging" tab; flown-truss defaults on create. |
| 4       | Patching: Rigging-Mounted vs Free  | Done        | 2026-05-03 | Structured rigging assignment + metric stage coords on the patch sheet; legacy 2D map and free-text rigging label retired. |
| 5       | Read-Only 3D Stage View            | Done        | 2026-05-03 | New /stage route with 2D ↔ 3D toggle. Backend pan/tilt metadata (axis + degree mapping) populated on every mover; 2D legacy panel re-fitted to metric coords. |
| 6       | 3D Editor Mode                     | Not started | —         |       |
| 7       | Polish (optional)                  | Not started | —         |       |

Status values: `Not started` · `In progress` · `Done` · `Blocked` · `Skipped`.
Update the row on session completion and fill in `Completed` with the
ISO date. Detailed handover notes belong in each session's **Status &
handover** block at the bottom of its section.

**Handover block format** — fill these on completion of every session so the
next one can be picked up cold:

- _Status_: one of the values above
- _Completed_: ISO date
- _What landed_: actual paths added/changed; any deviations from the plan;
  anything reduced in scope
- _Open follow-ups_: anything left for a later session (e.g. "data reset
  button still TODO", "decided to skip stageZ until Session 4")
- _Surprises / decisions_: unexpected behaviour, design tradeoffs taken
  in-flight that the next session needs to know about

## Cross-repo work

- **Pan/tilt range metadata** is a backend gap: `FixtureTypeInfo.properties`
  exposes slider min/max in raw DMX units but not the degree mapping or
  tilt inversion (today that info lives only in `@FixtureProperty`
  annotation strings). This will be fixed in `lighting7` as part of
  Session 5 — adding `degMin`, `degMax`, `inverted`, and an `axis`
  enum (`PAN | TILT | NONE`) to slider property descriptors, populated
  from the Kotlin annotations during registry build. The frontend wires
  these into `<FixtureModel>`'s `useFrame` so live moving-head beam
  direction works on first ship of the 3D view.

---

## Session 1 — Foundation

**Goal**: dependencies, types, queries, coordinate helper, data reset.

- Add deps: `three`, `@react-three/fiber`, `@react-three/drei`,
  `@react-three/postprocessing`, `@types/three`. Update `package.json`,
  `npm install`, verify `npm run build` clean.
- Update `FixturePatch` in `src/api/patchApi.ts:4-23` — add `stageZ`,
  `baseYawDeg`, `basePitchDeg`, `riggingUuid`,
  `worldPositionX/Y/Z` (all `number | null`).
- New RTK Query slices, mirroring `src/store/patches.ts`:
  - `src/store/riggings.ts` — `useRiggingListQuery`, `useCreateRiggingMutation`,
    `useUpdateRiggingMutation`, `useDeleteRiggingMutation`. Tag: `'Rigging'`.
  - `src/store/stageRegions.ts` — same shape. Tag: `'StageRegion'`.
  - Mirror the WebSocket invalidation pattern used at
    `src/store/patches.ts:15-17` so live config sync still works.
- Coordinate helper `src/lib/stageCoords.ts`:
  - `toThree(stageX, stageY, stageZ): Vector3` swizzle for R3F's Y-up default
    (lighting coords are Z-up — easier to swizzle than to flip
    `Object3D.DEFAULT_UP`, since the app already uses default-up Three.js
    nowhere else and we avoid camera-framing surprises).
  - `panTiltToDir(panDeg, tiltDeg): Vector3` per discovery doc lines 109–116.
  - `worldPositionFor(patch, riggings): Vector3` — prefers
    `worldPositionX/Y/Z` if set, else composes from `stage*` + rigging frame.
- **Data reset**: one-time mutation flow that nulls `stageX/Y/Z` on all patches
  with non-null values (existing percentages are meaningless under the new
  metres convention). Either a small admin button on `Patches.tsx` ("Clear
  legacy stage positions"), or done by hand once and relied on. Recommend the
  button — leaves an obvious migration path documented in the UI.

**Critical files**:
- `package.json`
- `src/api/patchApi.ts`
- `src/store/patches.ts` (reference for slice pattern)
- `src/store/riggings.ts`, `src/store/stageRegions.ts` (new)
- `src/lib/stageCoords.ts` (new)

**Verify**: `npm run type-check`, `npm run build`. Confirm new query hooks
return data in DevTools against a project with hand-seeded riggings + regions.

**Status & handover**:

- _Status_: Done
- _Completed_: 2026-05-03
- _What landed_:
  - Frontend deps: `three@^0.171`, `@react-three/fiber@^9.6`,
    `@react-three/drei@^10.7`, `@react-three/postprocessing@^3.0`,
    `@types/three@^0.171`.
  - `src/api/patchApi.ts` — extended `FixturePatch`, `CreatePatchRequest`,
    `UpdatePatchRequest` with `stageZ`, `baseYawDeg`, `basePitchDeg`,
    `riggingUuid`, plus read-only `worldPositionX/Y/Z` on `FixturePatch`.
  - `src/api/riggingApi.ts`, `src/api/stageRegionApi.ts` (new) — DTOs +
    create/update request types + WebSocket subscribe modules listening
    for `riggingListChanged` / `stageRegionListChanged`.
  - `src/api/lightingApi.ts` — `riggings` and `stageRegions` wired in.
  - `src/store/restApi.ts` — added `'Rigging'` and `'StageRegion'` tag types.
  - `src/store/riggings.ts`, `src/store/stageRegions.ts` (new) — RTK Query
    slices mirroring the patches.ts shape, with WS-driven tag invalidation.
  - `src/lib/stageCoords.ts` (new) — `toThree` (Z-up→Y-up swizzle),
    `panTiltToDir`, `worldPositionFor`, plus a `headQuaternionFor` helper
    used by Session 5's `<FixtureModel>` head-rotation update.
- _Open follow-ups_:
  - `worldPositionFor` rigging-frame composition is a translate-only stub.
    Real rotated-frame composition lands in Session 4 (or callers can rely
    on the backend's pre-composed `worldPositionX/Y/Z` until then — that's
    the preferred path anyway).
  - Frontend still has `riggingPosition: string | null` on `FixturePatch`
    and the form. Backend dropped it from `FixturePatchDto`; runtime value
    is `undefined` and existing checks tolerate that. Cleanup happens in
    Session 4 (per the existing plan).
- _Surprises / decisions_:
  - **Cross-repo addition**: lighting7 didn't yet broadcast
    `riggingListChanged` / `stageRegionListChanged`. Added
    `RiggingListChangedOutMessage` / `StageRegionListChangedOutMessage` in
    `Sockets.kt`, extended `FixturesChangeListener` with
    `riggingListChanged()` / `stageRegionListChanged()`, and called them
    from the rigging and stage-region routes. Rigging PUT/DELETE also
    broadcast `patchListChanged` so any rig-mounted patches' world
    positions are re-fetched downstream.
  - **Data reset dropped**: no meaningful legacy `stageX/Y` data exists in
    practice, so the planned admin button on Patches.tsx wasn't built.
  - **Three.js dep majors pinned** to versions known to work with React 19
    (R3F 9.x, drei 10.x, postprocessing 3.x).

---

## Session 2 — Stage Configuration

**Goal**: form-based CRUD for stage regions; project stage dimensions.

- Project-level: confirm `stageWidthM/DepthM/HeightM` are surfaced on
  Project Settings; if not, add the inputs there. Backend already persists.
- New page or section under existing Project Settings: **Stage Regions**.
  - Reuse the table + edit-sheet pattern from
    `src/routes/Patches.tsx` + `src/components/patches/EditPatchSheet.tsx`.
  - Sheet fields: name, centerX/Y/Z, widthM/depthM/heightM, yawDeg, sortOrder.
  - All numeric fields: `<Input type="number">` with `onFocus(e.target.select())`
    pattern from `EditPatchSheet.tsx:214`.
  - Footer: `flex-row justify-between` with destructive Delete + Cancel/Save
    per CLAUDE.md sheet conventions.
- Add to `src/navigation.ts` under Settings or Setup. Likely as a child of a
  new **Stage** group (which will also host Rigging in Session 3).

**Critical files**:
- `src/routes/StageRegions.tsx` (new)
- `src/components/stage/EditStageRegionSheet.tsx` (new)
- `src/navigation.ts`

**Verify**: create a region, edit it, delete it. Confirm WS invalidation makes
a second tab refresh.

**Status & handover**:

- _Status_: Done
- _Completed_: 2026-05-03
- _What landed_:
  - `src/api/projectApi.ts` — `ProjectDetail` and `UpdateProjectRequest`
    extended with `stageWidthM/DepthM/HeightM: number | null`.
  - `src/routes/StageRegions.tsx` (new) — exports `StageRegionsContent`
    (table + "Add region" button + edit sheet) and a
    `StageRegionsRedirect` for `/stage-regions` / current-project deep
    links. Regions sort by `sortOrder` then `id`.
  - `src/components/stage/EditStageRegionSheet.tsx` (new) — single sheet
    for create + edit, with destructive Delete in edit mode. Numeric
    fields treat empty string as `null`.
  - `src/routes/ProjectSettings.tsx` — added a fourth tab "Stage" that
    renders `StageDimensionsCard` (project-level w/d/h inputs hitting
    `useUpdateProjectMutation`) above `StageRegionsContent`.
  - `src/navigation.ts` — added "Stage" child entry under
    `project-settings` (icon: `Box`) so the sidebar deep-links to the
    new tab the same way `patches`/`surfaces` already do.
- _Open follow-ups_:
  - Riggings CRUD lands in Session 3 with the same shape (list page +
    edit sheet, child of `project-settings`).
  - Patch-placement field rework (Session 4) will start consuming
    `useStageRegionListQuery` + the project's stage dims for snap/clamp
    behaviour.
- _Surprises / decisions_:
  - Stage dimensions placed on the new Stage tab (above regions) rather
    than the General tab — keeps spatial config grouped. Confirmed with
    user in plan review.
  - No backend changes needed — Session 1 already exposed the
    stage-dimension fields on `Project`, and `StageRegion` REST + WS
    hooks were already wired.
  - Removed the unused `TabsContent` import from `ProjectSettings.tsx`
    while editing — drive-by cleanup.

---

## Session 3 — Rigging Configuration

**Goal**: form-based CRUD for riggings.

- Same shape as Session 2: list page + edit sheet.
- Fields: `name`, `kind` (free-text or pick from advisory list:
  TRUSS/BAR/BOOM/PIPE/FLOOR_STAND/OTHER), `positionX/Y/Z`,
  `yawDeg/pitchDeg/rollDeg`, `sortOrder`.
- Sensible defaults on create: a flown truss `kind=TRUSS`, `positionZ=4.5`,
  yaw/pitch/roll = 0.

**Critical files**:
- `src/routes/Riggings.tsx` (new)
- `src/components/rigging/EditRiggingSheet.tsx` (new)
- `src/store/riggings.ts` (from Session 1)

**Verify**: round-trip create/edit/delete; confirm
`GET /api/rest/project/{id}/riggings` returns the new entries.

**Status & handover**:

- _Status_: Done
- _Completed_: 2026-05-03
- _What landed_:
  - `src/routes/Riggings.tsx` (new) — exports `RiggingsContent({projectId})`
    with table (Name / Kind / Position / Rotation / Sort columns, hidden at
    sm/md/lg breakpoints), Add button, click-row-to-edit, edit sheet trigger.
    Sorted by `sortOrder` then `id`.
  - `src/components/rigging/EditRiggingSheet.tsx` (new) — single sheet for
    create + edit with destructive Delete in edit mode. `EMPTY_FORM` ships
    flown-truss defaults (`kind=TRUSS, positionZ=4.5, yaw/pitch/roll=0`)
    so an untouched create posts those values verbatim. Dirty-diff PUT on
    edit. Kind is a Select dropdown over the advisory list
    (`TRUSS / BAR / BOOM / PIPE / FLOOR_STAND / OTHER`) — required, no
    null/None option since there are no legacy entries to preserve.
  - `src/lib/utils.ts` — added `formatTriple` and `formatRotation`
    (extracted/shared between the regions and riggings list pages).
  - `src/components/ui/form-fields.tsx` (new) — exports shared
    `FieldGroup` and `NumberField`, replacing the duplicate copies that
    had grown in both edit sheets.
  - `src/routes/ProjectSettings.tsx` — added a fifth tab "Rigging" that
    renders `RiggingsContent` inside the standard `p-4 space-y-4 max-w-3xl`
    wrapper.
  - `src/navigation.ts` — added `rigging` child entry under
    `project-settings` (icon: `Anchor`).
- _Open follow-ups_:
  - Patch-side rig assignment (Mounting select tying `riggingUuid` to a
    rigging) lands in Session 4, plus the `riggingPosition` legacy field
    cleanup carried over from Session 1.
  - `worldPositionFor` rigging-frame composition is still translate-only
    (Session 1 carry-over); real rotated-frame composition or reliance on
    the backend's pre-composed `worldPositionX/Y/Z` is the Session 4 path.
- _Surprises / decisions_:
  - **Kind is a required Select**, not free text. Form state narrows to a
    `Kind` union (`TRUSS / BAR / BOOM / PIPE / FLOOR_STAND / OTHER`); no
    `None` option because there are no legacy entries that could carry an
    out-of-list value.
  - **`EMPTY_FORM` defaults are non-null** (opposite of the StageRegions
    sheet). The create call therefore sends `kind=TRUSS, z=4.5, yaw=pitch=roll=0`
    even when the user touches nothing — exactly the plan's flown-truss
    convention.
  - **Position fields have no `min={0}`** — riggings can sit at negative
    X/Y (downstage of zero). Only StageRegion size fields had a floor.
  - **Skipped a `RiggingsRedirect` export** — Session 2's parallel
    `StageRegionsRedirect` is currently unused, so building one for parity
    would just be dead code.
  - **`Anchor` icon** picked for the truss-hangs-from-structure metaphor.
  - **simplify pass extracted shared helpers**: `formatTriple` to
    `lib/utils.ts` (now used by both regions and riggings tables) and
    `FieldGroup`/`NumberField` to `components/ui/form-fields.tsx` (now
    used by both edit sheets). Dropped the duplicate copies that had been
    pasted into Session 2's files.

---

## Session 4 — Patching: Rigging-Mounted vs Free

**Goal**: edit rig assignment + 3D position on a patch (form-based).

- Rework the Stage section of `EditPatchSheet.tsx:226-235`:
  - Replace `<StageMapField>` (legacy 2D %) with a new `<PatchPlacementFields>`
    component containing:
    - **Mounting** select: "Free" or one of the project's riggings (label =
      `RiggingDto.name`). Bound to `riggingUuid`.
    - **Position** group: `stageX/stageY/stageZ` numeric inputs (metres). Help
      text changes based on mount: "world coordinates" vs
      "offset from rigging origin".
    - **Base orientation** group (collapsible, mostly for moving heads):
      `baseYawDeg`, `basePitchDeg`. Defaults left null.
- Drop `riggingPosition: string` from the form (free-text label, superseded by
  structured `riggingUuid`). Keep the field on the type for now; a follow-up
  can remove it from the DTO once nothing reads it.
- Save flow uses the existing `useUpdatePatchMutation`, partial-PUT pattern at
  `EditPatchSheet.tsx:140-150`. The backend will recompute `worldPositionX/Y/Z`
  on update.
- `Patches.tsx` table: add a "Mount" column showing rigging name or "Free".

**Critical files**:
- `src/components/patches/EditPatchSheet.tsx`
- `src/components/patches/PatchPlacementFields.tsx` (new — replaces
  `StageMapField` for editing)
- `src/routes/Patches.tsx`

**Verify**: assign a fixture to a rigging with offsets; confirm
`worldPositionX/Y/Z` returned on next list query reflects the composition.
Reassign to "Free"; confirm `riggingUuid` clears and world position becomes
the raw `stageX/Y/Z`.

**Status & handover**:

- _Status_: Done
- _Completed_: 2026-05-03
- _What landed_:
  - `src/components/patches/PatchPlacementFields.tsx` (new) — exports
    `PatchPlacementValue` + the component. Mounting `<Select>` (Free + each
    rigging from `useRiggingListQuery`), Position group (X/Y/Z metres) with
    flipping help text ("offset from rigging origin" vs "world coordinates"),
    and a native `<details>` "Base orientation (advanced)" wrapping
    yaw/pitch number fields. Reuses `FieldGroup` + `NumberField` from
    `components/ui/form-fields.tsx`.
  - `src/components/patches/EditPatchSheet.tsx` — replaced `stage` +
    `riggingPosition` state with one `placement: PatchPlacementValue`
    atom; removed `useMemo`/`useRef` imports. Dropped the 300 ms drag-debounce
    `useEffect` and `dragTimerRef` (Session 6 will reintroduce drag-debounce
    inside the 3D editor's own handlers). Dropped the `riggingPresets`
    memo and the `otherFixtures` memo with `StageMapField`. Dirty-diff PUT
    + `hasChanges` now cover `riggingUuid`, `stageX/Y/Z`, `baseYawDeg`,
    `basePitchDeg`. Stage section JSX collapsed from two blocks to a single
    `<PatchPlacementFields>`.
  - `src/routes/Patches.tsx` — added `useRiggingListQuery` and threaded a
    `Map<uuid,name>` into `buildPatchRows`. `PatchRow.riggingPosition`
    swapped for `riggingName`. The "Position" column became "Mount" at the
    same `hidden md:table-cell` slot — rigging name plain, italic
    muted "Free" otherwise.
  - Deleted `src/components/patches/StageMapField.tsx` and
    `src/components/patches/RiggingPositionInput.tsx` — both were only
    referenced by `EditPatchSheet`.
- _Open follow-ups_:
  - `riggingPosition` field still on `FixturePatch` /
    `CreatePatchRequest` / `UpdatePatchRequest` in `src/api/patchApi.ts`
    and read by `src/components/stage/StageMarker.tsx` (legacy 2D marker
    label). Per the Session 4 plan body it stays for now; full DTO removal
    is a follow-up once nothing reads it (likely after the 2D view is
    retired in/after Session 5).
  - `worldPositionFor` rigging-frame composition (Session 1 carry-over) is
    still translate-only. Session 5 callers should prefer the backend's
    pre-composed `worldPositionX/Y/Z`.
- _Surprises / decisions_:
  - **Auto-save dropped, not preserved.** The 300 ms debounced PUT was a
    StageMap-drag affordance; it doesn't belong on a structured form where
    every other field waits for Save. Session 6 reintroduces drag-debounce
    locally inside the 3D editor where it actually applies.
  - **Mount column reuses the Position slot, not appended.** `riggingPosition`
    now arrives as `undefined` from the backend, so the legacy column was
    rendering empty for every row — replacing rather than adding keeps the
    table from gaining a dead column.
  - **Free is italic muted text, not a badge.** Visually quieter than the
    rigging-name plain text, so the "no mount" state recedes while the
    structured assignment reads clearly.
  - **Native `<details>` for Base orientation.** Avoids pulling another
    Radix primitive; `<summary>` styling is the only custom touch.
  - **`useRiggingListQuery` takes a positional `number`**, not the
    `{ projectId }` object I initially wrote — caught at type-check.

---

## Session 5 — Read-Only 3D Stage View

**Goal**: render the scene from REST + live DMX. No editing yet.

- **Backend prep (lighting7)** — extend `PropertyDescriptor` for slider
  properties with:
  - `axis: "PAN" | "TILT" | "NONE"` (defaults to NONE)
  - `degMin: Double?`, `degMax: Double?` — degree mapping at slider min/max
  - `inverted: Boolean` — flips direction (some fixtures invert tilt)

  Populate from existing `@FixtureProperty` annotations in
  `FixtureTypeRegistry.kt` (parse the annotation strings, or, cleaner, add
  optional Kotlin annotation parameters and migrate the registered fixtures
  in the same change). Surface these on `FixtureTypeInfo.properties` over
  REST. Frontend `FixtureTypeInfo` slider type updated to match.
- New route `/stage` (or rename existing). New `src/routes/Stage.tsx` containing:
  - 2D ↔ 3D toggle button (segmented control, persisted in localStorage).
    2D branch renders existing `<StageOverviewPanel>` unchanged.
  - 3D branch renders `<Stage3D>`.
- `src/components/stage3d/Stage3D.tsx` — Canvas root:
  - `<Canvas>` from `@react-three/fiber`, `flat` shadow, `linear` colorspace.
  - `<OrbitControls>` from drei (touch enabled).
  - `<Bloom luminanceThreshold={0.15} intensity={1.7} radius={0.5} />` from
    `@react-three/postprocessing` per discovery doc lines 75–77.
  - Coordinate convention: see `src/lib/stageCoords.ts` swizzle. Camera framed
    to project bounding box (`stageWidthM/DepthM`).
- `<StageRegionMeshes>` — boxes from `useStageRegionListQuery`.
- `<RiggingMeshes>` — long thin boxes from `useRiggingListQuery`, oriented by
  yaw/pitch/roll.
- `<FixtureModel>` — one per patch:
  - Clamp + head group + lens disc + 2 cones + 2 floor pool circles per
    discovery doc lines 42–80.
  - Static position from `worldPositionFor(patch, riggings)`.
  - **Live colour** via `useColourValue` (or `useSettingColourPreview` /
    gel fallback) reusing the same property-resolution logic from
    `StageMarker.tsx:36-46`.
  - **Live intensity** via `useNormalizedIntensity` pattern at
    `StageMarker.tsx:190-204`.
  - **Live beam direction**: read pan/tilt slider values via
    `useSliderValue`, map to degrees using the new `degMin/degMax/inverted`
    metadata, compose with `baseYawDeg/basePitchDeg`, then convert to a
    direction vector via `panTiltToDir`. Apply imperatively to head group
    quaternion + cone + floor pool inside `useFrame`, no React re-renders.
- Reuse colour-source resolution (`findColourSource`,
  `findDimmerProperty` from `src/store/fixtures.ts`) — do NOT duplicate.

**Critical files**:
- `src/routes/Stage.tsx` (new — replaces or wraps current stage route)
- `src/components/stage3d/Stage3D.tsx` (new)
- `src/components/stage3d/StageRegionMeshes.tsx` (new)
- `src/components/stage3d/RiggingMeshes.tsx` (new)
- `src/components/stage3d/FixtureModel.tsx` (new)
- `src/components/stage3d/Bloom.tsx` (new — wraps the postprocess effect)
- `src/lib/stageCoords.ts` (from Session 1)

**Verify**: load page with a stage region, a truss, a few patched fixtures;
confirm meshes render at expected positions. Run a scene that pulses dimmer
and a colour scene — confirm fixture lens + cone + pool change in real time
without React re-renders (observe via React DevTools Profiler).

**Status & handover**:

- _Status_: Done
- _Completed_: 2026-05-03
- _What landed_:
  - **Backend (lighting7)**: extended `@FixtureProperty` with `axis`
    (new `PanTiltAxis` enum: `PAN | TILT | NONE`), `degMin`, `degMax`,
    `inverted` optional params (NaN as the unset sentinel for the doubles,
    converted to `null` on reflect). Threaded through
    `Fixture.Property` and both slider-creation paths in
    `DmxFixture.kt` (top-level + element). `SliderPropertyDescriptor` in
    `routes/lightFixtures.kt` gained 4 nullable wire fields. Every
    moving-head fixture in the registry got `axis = PanTiltAxis.PAN/TILT`
    and degree ranges from datasheet:
    Martin Mac 250 (540°/257°), Varytec Easymove XL 60 Spot (630°/270°),
    Robe ColorSpot 575 (540°/257°), Fusion 100 Spot MkII (540°/210° × 3
    modes), Source 4 Revolution (540°/270°), Gear4Music Orbit-70
    (540°/270°), IMG Stageline Wash-42LED (540°/180°), Shehds LED 19 RGBW
    (540°/270° × 2 modes), Slender Beam Bar Quad (540°/270°), Scantastic 4
    (180°/90°). Laserworld CS-1000 RGB Mk3 was deliberately skipped — its
    "Pan/Tilt" channels are galvo offsets, not real head rotation; tagging
    it would mislead the 3D view.
  - **Frontend types**: `SliderPropertyDescriptor` in
    `src/store/fixtures.ts` mirrors the new wire fields (`axis`,
    `degMin`, `degMax`, `inverted`). Added `findPanProperty` and
    `findTiltProperty` helpers alongside `findDimmerProperty`.
  - **`src/lib/stageCoords.ts`**: added `dmxToDegrees(dmx, slider, base?)`
    (returns `null` when the slider lacks both deg bounds — head stays
    static; never invent a range), `headQuaternionFor(panDeg, tiltDeg)`
    (allocation-free Euler→Quaternion variant of `panTiltToDir`), and
    `worldPositionLighting(patch, riggings)` (lighting-coord twin of
    `worldPositionFor`; needed by the 2D top-down panel which reasons in
    metres rather than R3F space).
  - **`src/hooks/useNormalizedIntensity.ts` (new)**: extracted from
    `StageMarker.tsx:190–204` so 2D + 3D leaves share one
    fallback-slider definition.
  - **`src/components/StageOverviewPanel.tsx`**: re-fitted to metric
    coords. Now reads `useProjectQuery` (for `stageWidthM`/`stageDepthM`,
    defaults 10×8 m) and `useRiggingListQuery`; computes each placed
    patch's stage position via `worldPositionLighting`, then maps to
    canvas % with FOH at the bottom, upstage at the top, stage centre at
    `x=0`. Patches with no resolvable position are filtered out. The
    legacy "drag the dot…" empty-state copy now reads "Open a patch and
    set its stage position."
  - **`src/components/stage3d/` (new)**:
    - `Bloom.tsx` — `<EffectComposer>` + `<Bloom luminanceThreshold=0.15
      intensity=1.7 radius=0.5 />` per stage-vis-discovery.md L75–77.
    - `StageRegionMeshes.tsx` — translucent boxes with edge outlines.
    - `RiggingMeshes.tsx` — 3 m bar per rigging (no length field on the
      DTO yet — Session 7 polish), Euler `'YXZ'` rotation matching the
      stageCoords convention.
    - `FixtureModel.tsx` — clamp + head group + lens + outer/inner cone
      + outer/inner floor pool. Colour leaves (`ColourBeamSync`,
      `SettingColourBeamSync`, `FixedColourBeamSync` for gel/dimmer-only)
      mirror the dispatch in `StageMarker.tsx:36–46, 91–126`, but write
      colour/opacity imperatively into the cone/pool/lens material refs
      via `useEffect` — not via React-driven props (avoids one
      re-render per channel push). `<BeamDirector>` reads pan/tilt via
      `useSliderValue`, runs `useFrame` to compute beam direction with
      `dmxToDegrees` + `panTiltToDir`, and updates head quaternion +
      cone orientation + pool floor-intersection imperatively. Module-
      scoped `SCRATCH_DIR / SCRATCH_NEG_DIR / SCRATCH_QUAT / SCRATCH_POOL`
      keep the hot path allocation-free.
    - `Stage3D.tsx` — `<Canvas flat>` with `OrbitControls`, ambient +
      `gridHelper`, `<StageBoxOutline>` wireframe of the stage volume,
      and Bloom. Camera framed against `stageWidthM × stageDepthM`.
  - **Route + nav**:
    - `src/routes/Stage.tsx` (new) — top-level route with 2D ↔ 3D
      `<ToggleGroup size="sm">` persisted in `localStorage["stageViewMode"]`
      (default 3D). `<StageRedirect>` mirrors `FixturesRedirect`.
    - `src/App.tsx` — added `/projects/:projectId/stage` and bare
      `/stage` redirect.
    - `src/navigation.ts` — renamed the existing settings child label
      from "Stage" to "Regions" (id/path unchanged); added a new
      top-level `id: "stage-view"` entry in the `live` group with
      `Boxes` icon, `visibility: "always"`.
- _Open follow-ups_:
  - **No R3F edit interactions yet** — `onClick` selects a fixture
    (visible white ring on the lens) but no drag/sheet handling.
    Session 6 covers click-to-edit + drag.
  - **Rigging length is fixed at 3 m**. A future RiggingDto field
    (`lengthM`?) would let `<RiggingMeshes>` render real proportions;
    deferred to Session 7 polish.
  - **Pan/tilt fine channels (PAN_FINE / TILT_FINE)** are not yet folded
    into the degree calculation — the 3D view reads coarse-only, which
    gives 256-step resolution over the head's full sweep (more than
    enough for visual rendering).
  - **`PositionPropertyDescriptor` was deliberately not extended.** Per
    plan-strict scope the slider variant is the one the frontend reads
    (via `findPanProperty/findTiltProperty` against `axis ===
    'PAN'/'TILT'`). For fixtures that surface only a position descriptor
    and no axis-tagged sliders, the head will render static — acceptable
    for now because the existing reflection emits both descriptors for
    `WithPosition` fixtures.
  - **`worldPositionFor` rigging-frame composition** is still
    translate-only (Session 1 carry-over). Session 5 prefers the
    backend's pre-composed `worldPositionX/Y/Z`, so rotated rigging
    frames work end-to-end via that path; the fallback only hits when
    the backend hasn't re-composed (e.g. a freshly assigned rig before
    the next list query).
  - Legacy `riggingPosition: string | null` field still on
    `FixturePatch` and read by `StageMarker.tsx:63–74` for the badge
    label. Cleanup deferred until the 2D legacy view is fully retired.
  - **Flagged by `/simplify` but skipped this session** (each spans
    multiple unrelated files; pick up when the surface is touched
    again):
    1. **Unify the colour-source dispatch between
       `StageMarker.tsx` and `FixtureModel.tsx`.** Both files run the
       identical `findColourSource` / `findDimmerProperty` /
       `acceptsGel + gelCode → findGel` discriminator and then split
       into a leaf-per-source (Colour / Setting / Gel / Dimmer-only /
       Placeholder). The leaves diverge in *what* they render (CSS vs
       Three materials) but the *input* they need is identical: one
       CSS colour string + a 0..1 intensity. Lift either a
       `resolveColourSource(patch, fixture, fixtureType)` helper into
       `src/store/fixtures.ts` (smaller, returns a tagged union both
       sites switch on), or a full `useFixtureColour(...) → { css,
       intensity }` hook (larger but lets each consumer collapse to a
       single visualiser). Touching `StageMarker` is the risk — it's
       the load-bearing 2D renderer used inside `StageOverviewPanel`
       and `ProjectOverview`.
    2. **Three small generic hooks each duplicated 3+ times
       across the codebase.** All worth extracting on the next sweep
       through their respective files:
       - `useFixtureLookup()` — the `fixtureByKey` /
         `typeByKey` `useMemo` Map-builder duplicated in
         `Stage3D.tsx`, `StageOverviewPanel.tsx`, and
         `runner/program/CueCardEditor/MiniStage.tsx`.
       - `useLocalStorage<T>(key, default)` — `useStageViewMode`
         is the 6th hand-rolled instance (alongside
         `useStageOverview`, `useEffectsOverview`,
         `useFixtureOverview`, `useCueSlotOverview`, plus inline
         `localStorage` reads in `ThemeToggle` and
         `CueSlotOverviewPanel`). Worth one shared hook so the
         JSON-vs-string serialisation policy lives in exactly one
         place.
       - `normaliseSliderDmx(dmx, min, max)` — the `(value - min)
         / span` clamp logic in `dmxToDegrees` is also in
         `usePropertyValues.ts:260–263`,
         `useGroupPropertyValues.ts:407–410`,
         `PropertyVisualizers.tsx:247–251`, and
         `GroupPropertyVisualizers.tsx:299–300`. Lift to a shared
         helper (likely in `src/lib/stageCoords.ts` or
         `src/lib/dmx.ts`).
    3. **Backend pan/tilt description strings now duplicate
       structured `degMin`/`degMax`.** Annotations like
       `@FixtureProperty("Pan adjustment 0-540°", category = PAN,
       degMin = 0.0, degMax = 540.0, ...)` carry the range in two
       places. A future cleanup could either auto-suffix the
       degree range when the structured fields are set
       (centralising the format) or strip the redundant text from
       the description so the structured fields are the only source
       of truth. Do this when the next mover gets added — that's
       the moment the inconsistency would otherwise silently
       grow.
- _Surprises / decisions_:
  - **2D fallback was repaired, not dropped.** The plan body said "2D
    branch renders existing `<StageOverviewPanel>` unchanged" but Session
    4 had silently broken it (CSS `left: %` against metric metres). Per
    user directive 2D is the phone view and stays — so this session
    re-fitted `StageOverviewPanel` to metric coords using
    `useProjectQuery` + `worldPositionLighting`. ProjectOverview's
    embedded panel benefits for free.
  - **Annotation populated for every mover, not just the common ones.**
    Per user directive. Where the description string already encoded
    the range (Varytec, Fusion, IMG, Shehds, Slender, Scantastic) the
    numbers came verbatim; for fixtures with only "Pan (coarse)" the
    datasheet was consulted (Martin, Robe, Source 4, Gear4Music). No
    range was invented.
  - **Two cone-orientation false starts in `<BeamDirector>`.** R3F
    `coneGeometry` defaults to apex at +Y and base at -Y. To put the
    apex at the fixture origin and base along `+dir` requires mapping
    +Y → **-dir** then translating by +(length/2)*dir. Doing it the
    "obvious" way (+Y → +dir) puts the base in the wrong direction.
    Documented inline.
  - **Colour applied via `useEffect`, not React props on materials.**
    Cones/pool/lens use `MeshBasicMaterial` whose colour we mutate
    imperatively from a leaf component that subscribes to the colour
    hook. Setting colour via JSX would re-render `<FixtureModel>` on
    every channel push; the imperative update keeps the geometry tree
    stable. Lens opacity tracks `0.5 + 0.5*intensity` so the lamp body
    is always visible when on, not just during full intensity.
  - **`Boxes` icon for the new top-level entry.** `Box` was already
    used by the (now renamed) "Regions" settings child; `Boxes` (lucide)
    visually echoes the multi-mesh nature of the 3D view.
  - **Cross-repo build passed clean** with two pre-existing
    `Unchecked cast of KProperty1` warnings unchanged. No frontend
    type-check or build regressions; the type-check was clean on the
    second pass after fixing a `project` variable shadow in
    `StageOverviewPanel`.

---

## Session 6 — 3D Editor Mode

**Goal**: visual editing on tablet+ viewports.

- Add an "Edit" toggle in `<Stage3D>` toolbar — only enabled when
  `useMediaQuery(SM_BREAKPOINT)` returns true. Phones see view-only.
- **Click-to-edit**: pointer events on each mesh open the relevant existing
  edit sheet — `EditStageRegionSheet`, `EditRiggingSheet`, `EditPatchSheet`.
  Sheets are slide-over so the 3D canvas remains visible behind them and
  changes are seen live.
- **Visual drag**:
  - Stage regions / riggings: drei `<TransformControls>` for
    translate-on-ground-plane. Rotation via gizmo for yaw.
  - Fixtures: depends on mount.
    - Free fixtures: `TransformControls` translate.
    - Rigging-mounted: drag along the rigging's local X axis only (project
      pointer onto the rigging's line; update `stageX` only).
- **Live binding**: drag updates local mesh transform AND the in-flight
  edit-sheet form state. Mutation is debounced (300ms) per the pattern at
  `EditPatchSheet.tsx:76-85` so the backend isn't hammered mid-drag.
- **Add new** affordances: "+ Add Rigging" / "+ Add Region" buttons in the
  toolbar that drop a default-sized object at stage centre, then immediately
  open its edit sheet.
- Form fields on the sheets continue to work — visual is "another input",
  numeric fields stay authoritative for precise placement.

**Critical files**:
- `src/components/stage3d/Stage3D.tsx` (extended)
- `src/components/stage3d/EditModeProvider.tsx` (new — context for selection +
  edit mode toggle)
- `src/components/stage3d/dragHandlers/` (new — translate-on-plane, drag-along-rig)
- existing edit sheets from Sessions 2/3/4

**Verify**: drag a fixture across the floor, see beam pool follow and the
sheet's `stageX/Y` numbers update live; release, then 300ms later see the
PUT fire (Network tab). On mobile width, confirm the Edit toggle is
disabled with an explanatory tooltip.

**Status & handover**: _Not started._

---

## Session 7 — Polish (optional)

- **Zoom**: read beam-angle DMX channel into cone radius; currently fixed at
  `patch.beamAngleDeg` static value.
- **Performance**: cap `castShadow` to a configurable subset; raycast only the
  selected mesh in edit mode; geometry instancing for repeated truss segments.
- **Gobo / strobe / fixture library**: out of scope per discovery doc lines
  381–387. Track separately.

**Status & handover**: _Not started._

---

## Cross-cutting verification

- `npm run type-check` and `npm run build` clean at end of every session
  (CLAUDE.md gates these as the pre-commit equivalent).
- Backend: ensure a project has at least one rigging, one stage region, and
  one rig-mounted patch + one free patch for end-to-end testing.
- Manual smoke: start `lighting-react` dev server, point at running
  `lighting7` backend on `:8413`, run a Kotlin scene script that varies
  pan/tilt/RGB/dimmer — confirm 3D scene reflects in real time, no
  per-frame React re-renders, and 2D toggle still works.
