# The Surfaces view — engineering notes

`/projects/:id/settings/surfaces` (`routes/Surfaces.tsx`). A picture of the attached MIDI desk, an
inspector for whichever control you click, and — under *Edit bindings* — a library you drag onto it.

The plan and the decisions are `lighting7/docs/plans/midi-surface-plan.md`; the layout authority is
`lighting7/docs/plans/midi-surface-design/` (`Main.dc.html` run mode, `Edit.dc.html` edit mode,
`Legend.dc.html` the control-state vocabulary). The backend contract is
`lighting7/docs/midi-control-surface-engineering.md`. This file is the client half: the things that
will bite.

## The picture is data, and the state is what the hardware was told

`SurfacePanel` draws `ControlSurfaceType.layout` — named regions and a grid cell per control — so a
second device is one `.kt` file in lighting7 and no component here. Every state it shows comes from
the `surfaceControls` stream, which is what `SurfaceFeedbackPublisher` *sent*, never a
recomputation from DMX. **If the picture and the desk disagree, the publisher is wrong**, and that
is the bug worth finding rather than papering over here.

`strips` and `layout` are **optional client-side**: a desk on a pre-strip build serves neither, and
this client talks to whatever desk it is pointed at. Without a layout the page falls back to
`BindingMatrix`, which is also the rendering below `md`.

The one place the panel reads DMX is the inspector's **stage value** line, and deliberately: the
other three live lines answer "what is the desk doing with this control" and that one answers "and
what came of it". A fader at 66% over a dimmer reading 0 is a bound control writing into a park.

## `lib/surfaceResolve.ts` is a mirror, and its failure is silent

The wire carries raw binding rows. `ControlSurfaceBindingService.resolve` and `deriveStripTarget`
are what turn those into "what is this control actually doing", and neither is exposed — so the
panel, which labels every control, re-derives both. A precedence read the wrong way round paints a
plausible label for a control the desk drives differently, and no rig check reaches the browser
copy. `surfaceResolve.test.ts` replays the Kotlin cases; keep it in step with
`midi/ControlSurfaceBindingService.kt` and `midi/StripDerivation.kt`.

The order is **the control's own row across both bank levels, then its strip's** — direct before
strip at *both* levels, which an "obvious" bank-first reading gets backwards.

## Editing: one context, two zones, one write

Edit mode is **local state in `SurfacesContent`**, not a Redux slice. The busk view needs a slice
because the cue-slot overlay is a *sibling* of the routed page; here the library and the picture are
both inside this route.

Dnd is the app's single `DndContext` (`components/dnd/DeskDndProvider.tsx`), joined with
`useDndMonitor` and **never nested** — the busk page's rule, and the reason `SurfacesContent` must
be rendered inside that provider (`Layout.tsx` mounts it; the tests mount their own). Ghosts go
through `dnd/dragOverlayRegistry.ts`, registered at module scope.

Four things are load-bearing:

- **Droppables sit on the grid-cell wrapper, never inside `ControlCell`** — that cell is memoized so
  a 20 Hz `surfaceControls` delta re-renders only the controls that moved, and `useDroppable`
  re-renders its host whenever `isOver` flips. **And the wrapper is two components, not one with a
  `disabled` flag**: `PanelRegion` reads `controls[…]`, so it re-renders on every frame, and a
  single wrapper would re-run `useDroppable` for every control on the device at stream rate while
  nobody is dragging. Run mode — the state the panel spends its life in, and which has no drop
  target at all — renders no hook.
- **Legal targets follow the source, told twice.** A **row** lands on a strip and nothing else; a
  **chip** lands on one kind-matching control and nothing else. Enforced by dnd-kit's own
  `disabled` — which keeps `over`, and so the highlight, off a place the drop would refuse — *and*
  by the pure `canLand` in `lib/surfaceDrop.ts`, which is the half a test can reach.
- **A drop patches the control's own row at the exact bank, or creates.** `exactBindingAt`, never
  `resolveControl` or its sibling `activeBindingAt`: those answer a strip's row for a strip's
  control and a global row when no exact-bank one exists, and patching either moves a binding the
  operator was not pointing at. A chip on a strip's fader must *create* a direct row — the only way
  "direct beats strip" is reachable from the UI. A created row takes the **active bank**, because
  that is the bank the panel is drawing.

  The two lookups differ by one fallback and the split is the point: **`exactBindingAt` is the
  write question, `activeBindingAt` the read one.** Anything saying what a slot is *doing* — a
  label, a remove cross, the library's placement badge — must see the bank-agnostic row, which
  really is in force on every bank.
- **One remove cross per row, not per control.** A control's own row is crossed off on the control;
  a strip's is crossed off on the strip's column backdrop, where one cross means one row rather than
  four controls.

### What the router will and will not dispatch

`controlKinds` in `lib/surfaceDrop.ts` is read off `SurfaceInputRouter.matchEvent`, and two arms are
surprises:

- An **encoder with a push note reaches both halves** — its CC is a `Continuous` and its note a
  `ButtonPress`, on one control id. The X-Touch declares a push on all sixteen, so an encoder
  legitimately takes a cue chip as well as a property one.
- A **bank button takes nothing at all**: `route` answers `ResolvedInput.BankButton` and switches
  the bank *before* resolving a binding. A row there can never fire, so the library will not offer
  one and `BankButtonCell` draws its own label whatever row sits on its id — but it draws itself
  **dead** when one does, because the picture's promise is that it mirrors the desk and an orphaned
  row only the inspector mentions is one nobody scanning the surface would find.

Nothing on the backend refuses a button target on a fader (`refuseWrongSlot` guards only the strip
slot, `refuseUnknown` only the undecodable row), so **the eligibility dim is the whole warning**
between the operator and a control that silently does nothing. That is a client-only guard on a
real footgun, and any other write path to the same endpoint bypasses it —
`FU-MIDI-BIND-CONTROL-KIND` in lighting7 is the backend half.

## The desk selection

One desk, one selection, server-owned — the composition model's argument for one programmer,
verbatim. `store/selection.ts` is the cache (no REST behind it; `selection.state` is both the
snapshot and the broadcast), and three surfaces move it: the busk view's target band
(`useBuskingSelection`), the programmer's fixture list (`useDeskSelectionBridge`), and a
`selectTarget` button on the surface itself.

Read `components/fixtures-list/useDeskSelectionBridge.ts` before touching the list half. Its four
rules each fail silently, and the first is the one the plan names: **rows are published through
`rowLocateTarget`** (via `selectedRowTargets`), never through the `programmer` scope's `targetKeys`,
which `expandSelectionToTargets` has already flattened to member keys. Publish those and a marquee
over *Front wash* arrives at the desk as eight loose fixtures, with the strip's group select LED
dark.

## `hooks/useTargetProperties.ts`

Closes `FU-FE-USE-TARGET-PROPERTIES`, and lands as **two** exports rather than one hook, because the
consumers want different halves: `categoriseProperties` (pure, generic, narrowing) for the surfaces
that *render* properties and need the descriptors, and `useTargetProperties` / `useRigProperties`
(flat) for the surfaces that *bind* them and need names plus "can a fader drive this".

`continuous` mirrors `PropertyChannelResolver`: sliders and colours only. A position pair or a
setting on a fader would be a control that does nothing, so the library does not offer one.
