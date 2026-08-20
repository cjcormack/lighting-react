# Stage visualisation: sources and appearance

How the stage surfaces decide **what a fixture looks like**. Two independent seams:

- a **channel source** — which layer of the lighting cascade the numbers come from;
- a **fixture appearance** — how a fixture's colour source turns those numbers into a colour and a
  level.

## The vis source

The desk transmits one merged DMX frame, and until this landed every stage surface drew exactly
that. In **Blind** that is the wrong picture: the programmer is gated out of the merge, so the stage
keeps showing the pre-blind look while the operator builds a cue they cannot see. The programmer
sheet already solved this at cell granularity (`fixtures-list/ownership.ts::applyStagedValue`); the
stage did not.

`hooks/useVisSource.ts` holds the operator's choice of three:

| Source | What it draws |
|---|---|
| `output` | Final merged DMX — what the desk is transmitting. |
| `outputProgrammer` | Output with the programmer laid over it. Identical to `output` unless Blind is on. |
| `programmer` | Only what the programmer holds; every other channel reads 0. |

`programmer` is literal on purpose: an empty programmer shows an empty stage, and a fixture given
intensity but no position sits at pan/tilt 0 rather than borrowing a position from the wire.

It is a **module store read through `useSyncExternalStore`**, not `usePersistentState`. Two surfaces
read it — the Stage route's View menu and the globally-mounted `StageOverviewPanel` — and
`usePersistentState` reads its key once in a `useState` initialiser and never listens for changes,
so two components sharing a key drift apart the moment one writes.

The stored value is narrowed through `isVisSource` on read. A value written by a later build (a
fourth source, say) must not reach code that has no case for it.

### The fourth source: Next GO

Previewing the look the next GO would produce is the one source that isn't a merge of what the
desk already holds — it needs a *hypothetical* cue set composed. The backend does that now:
`POST /project/{id}/cue-stacks/{stackId}/preview` returns the channel values a cue would produce,
run through the real `CueAssignmentResolver`, and "next" is a server-owned concept broadcast on
`cueRunStateChanged` (so which cue is being previewed is no longer a per-session guess). See
lighting7 `docs/cue-stacks-engineering.md` §"Preview compose" and §"Standby".

What remains is a `ChannelSource` over that response — re-requested on `cueRunStateChanged`,
since the previewed look changes whenever the next cue does — and a fourth `VisSource` member.
Two limits shape the UI: the preview is **Layer 4 only** (a cue whose look is carried by an
effect previews as little or nothing), and channels no cue asserts are **absent** rather than 0,
so the source must fall back to the wire for them the way `outputProgrammer` overlays.

### Injection is at channel level

`api/channelSource.ts` defines `ChannelSource` — `get`, `getByKey`, `subscribeToChannel` — and
`hooks/useChannelSource.tsx` supplies one by context, defaulting to the wire. Every reader takes a
source; nothing but the source knows about layers.

Channel level rather than property level, because `FixtureModel`'s per-frame beam director reads 13
channels by key (pan, tilt, their fine axes, zoom, focus, two gobo wheels, gobo rotation, prism,
prism rotation, and two macros). Substituting at property level would mean touching each of those
reads and knowing which descriptor backs each; substituting at channel level means they all work
unchanged.

`ChannelSource` deliberately has **no `getAll()`**. A composing source would have to allocate a
merged map per fixture per frame to answer it. `getByKey` keeps every source O(1) and
allocation-free, which is what that frame loop requires.

**The provider wraps only the canvases** — the `Stage3D` / `Stage2DView` element in `routes/Stage.tsx`
and the `StageBackdrop` in `StageOverviewPanel.tsx`. Not `<main>`: the docked
`StageFixtureControlPanel` renders `FixtureDetailView`, a live editing surface that must keep
reading and writing the real wire whatever the stage is previewing. The same reasoning keeps
`useVirtualDimmer` on the default source — all of its consumers are editing controls.

R3F's `<Canvas>` is a separate reconciler root, but context still crosses it: `@react-three/fiber`
v9 wraps the Canvas root in an `its-fine` context bridge (`useBridge()`). Nothing else in this app
depends on that, so it is worth a smoke test after any R3F upgrade.

### Resolving the programmer to channels

`lib/programmerChannels.ts` turns `programmer.state` into a channel map. Two things to know:

**`ProgrammerState.channels` is the sideband, not the programmer's output.** It carries only what
the property model can't lift: raw `updateChannel` writes on unbacked channels, raw pan/tilt axis
writes, and unpark hand-downs. A dimmer or colour written through `programmer.set` lands in a
*property* entry and never appears there. Reading the picture off `channels` alone yields an almost
empty stage.

So the real work is `resolveEntryChannels`, which mirrors lighting7's `PropertyChannelWriter`:
level → one channel; colour → r/g/b plus white/amber/uv **only where the descriptor has that
channel** (the client-side stand-in for the backend's `WithWhite` / `WithAmber` / `WithUv` trait
gate); position → coarse pan/tilt only, because the backend writes no fine channels for a position
assignment either. A shape mismatch resolves to nothing rather than a guess.

The descriptor index covers **element keys as well as fixture keys**: a multi-head fixture's entries
are keyed by element key, so an index built from `Fixture.properties` alone would drop every
per-head write.

**Sideband-last is a documented approximation.** The backend arbitrates a property entry against a
sideband slot on the same channel by write sequence (`ProgrammerStore.Slot.seq`), which never
reaches the client. A deliberate property write already absorbs the sideband beneath it, so a slot
surviving under one is not a state the backend normally holds; where the two could differ, favouring
the sideband keeps raw writes visible, which is what the sideband is for.

**`holds(key)` is not `getByKey(key) !== 0`.** The programmer legitimately holds a dimmer *at* 0, and
treating that as "no opinion" would let the wire value show through in exactly the case Blind most
needs to preview. The overlay source keys off `holds`.

That has a consequence for change notification: `notifyChanged` compares **presence as well as
value**, not value alone. A channel going from absent to held-at-0 is no change to the
programmer-only source (0 either way) but a real one to the overlay (wire value → 0). Comparing
values with absent-treated-as-0 would see nothing and wake nobody, so a cue holding a dimmer at full
would keep painting full after the operator zeroed it in a blind programmer.

Latency: `programmer.state` arrives on the backend's 100 ms provenance debounce, but
`programmerWsApi`'s `applyLocalEntry` echoes our *own* writes into `entries` immediately, so an
operator's fader drag previews at input rate.

## Fixture appearance

`components/fixtures/fixtureAppearance.tsx` answers "what colour is this fixture, and how lit", for
any of five colour sources: an RGB colour property, a colour wheel, a gel, a bare dimmer, or a
multi-element pixel bar (plus a placeholder for a patch with no fixture).

`FixtureAppearance` carries the hue at **full** brightness and the **linear** 0..1 level. Both raw,
because each medium curves them differently:

- the DOM marker folds `perceptualBrightness` into a box-shadow and an opacity;
- the 3D scene splits them — perceptual on the lens, **linear** on the cone and pool, because those
  opacities double as the `LIGHT_OFF_OPACITY` beam cull;
- the SVG plot bakes brightness into the fill with `dimCssColour`.

This is why `useColourAppearance` is not the shared piece: it returns only a pre-baked CSS string and
drops the level. It stays as it is for the swatch callers that only want the string.

### Why a render prop

Each colour source needs a *different* set of value hooks — `useColourValue` wants a
`ColourPropertyDescriptor`, `useGroupColourValues` subscribes to a variable-length channel list, a
gel fixture needs neither — so they cannot collapse behind one hook without breaking hook order.
`FixtureAppearanceSource` dispatches to a leaf component per source, each with a fixed hook set, and
hands the result to `children`. That constraint is why the 2D plot went without live colour for so
long, and the render prop is the way around it.

Consumers: `StageMarker` (DOM) and `Stage2DShapes`' `FixtureShape` (SVG). `FixtureModel` keeps its
own **imperative** mirror of the same dispatch on purpose — R3F is a separate reconciler root and
store-driven re-renders drop beat-rate changes, so the 3D path writes straight to the scene from the
channel callback. Three copies of the shape, two of the code; changing the dispatch means changing
`fixtureAppearance.tsx` and `FixtureModel`'s `ColourSync` together.

### The 2D plot

`FixtureShapes` draws fixtures in a loop, so live colour needed a per-fixture component
(`FixtureShape`) to hang hooks on. Keeping the values *inside* that child also matters for
performance: `FixtureShapes` is `memo`'d and runs an O(n²) label declutter, and the old
`colourFor(patch)` callback prop would have re-run both on every DMX frame had its identity started
changing with the values.

Two traps in the SVG:

- **Do not set `stroke` on an unselected fixture.** The outline comes from a Tailwind class
  (`stroke-foreground/40`) so a pale tungsten dot stays visible on a light background, and CSS beats
  the presentation attribute — setting the attribute would kill the theme-aware outline. The
  attribute is for the selection highlight only.
- **Brightness goes into the fill, not `fill-opacity`.** The fixture already sits inside a `<g>` whose
  opacity carries group-filter dimming; a second opacity would fight it.
- **The fill has a brightness floor** (`BODY_FLOOR`, `SEGMENT_FLOOR`). A dark rig is the normal state
  while patching, which is most of what this plot is for, and an unfloored fill draws every dot pure
  black — leaving only a 40%-opacity outline to find it by. The DOM marker has the same floors,
  expressed as `0.3 + lit * 0.7` on its opacity; these are the same numbers folded into the fill.

A pixel bar draws as a segmented strip (one rect per element, each at its own brightness) with a
single outline rect over the top, rather than as one dot. Its geometry comes from `stripGeometry`,
which reads the **element-group descriptor**, not a live appearance — so the pointer hit target can
be sized to the strip without waiting on DMX. A bar is several times wider than a dot, and a
dot-sized hit circle leaves the ends of a long bar unclickable. `stripGeometry`'s `count > 1` gate
must stay in step with `FixtureAppearanceSource`'s, which decides whether an appearance carries
`segments` at all; `Stage2DShapes.test.ts` pins them together.
