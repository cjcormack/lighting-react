import { memo, useMemo, useState } from "react"
import { useDraggable, useDndMonitor } from "@dnd-kit/core"
import { GripVertical, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { registerDragOverlay } from "@/components/dnd/dragOverlayRegistry"
import {
  ATTRIBUTE_FAMILIES,
  FAMILY_LABELS,
  familyForCategory,
  type AttributeFamily,
} from "@/lib/attributeFamily"
import { useFixtureListQuery } from "@/store/fixtures"
import { useGroupListQuery } from "@/store/groups"
import { useProjectCueStackListQuery } from "@/store/cueStacks"
import { useLookListQuery } from "@/store/looks"
import { useTemplateListQuery } from "@/store/templates"
import { useBuskPagesQuery } from "@/store/busk"
import { allPads } from "@/lib/buskLayout"
import { padFaceOf } from "@/components/busking/padFace"
import { useRigProperties, useTargetProperties, type AvailableProperty } from "@/hooks/useTargetProperties"
import { surfaceDragData, type SurfaceDragData } from "@/lib/surfaceDrop"
import type { BindingTarget, BankDefinition } from "@/store/surfaces"
import type { CueTarget } from "@/api/cuesApi"

/**
 * The binding library, as a palette rather than a picker (D9).
 *
 * It takes the inspector's slot while *Edit bindings* is on, and every row is a thing waiting to
 * be dragged onto the picture: **a row lands on a strip, a chip lands on one control**. The rule
 * itself lives in `lib/surfaceDrop.ts`, which is also where the drop's binding request is decided;
 * this file is the rows, the chips and the dimming.
 *
 * **Its dnd is the app's one `DndContext`** (`dnd/DeskDndProvider.tsx`), joined here with
 * `useDndMonitor` and never nested, for the busk page's reason. Foreign drags are ignored by id on
 * both sides.
 *
 * **The kind row stays at the artboard's six** — All · Groups · Fixtures · Looks · Cues · Desk —
 * so the two record kinds session 4 added fold into it rather than widening a 360px segmented
 * control to seven: a **template** files under *Looks*, the row of named recallable records, and a
 * **busk page** under *Desk*, which already holds the encoder bank.
 *
 * *Next page* / *Prev page* live on the Desk row and not on each page's row. `Edit.dc.html` draws
 * them on its single *Busk · Verse* row and so cannot distinguish "on this page's row" from "on
 * every page's row"; a project with ten pages would repeat two identical chips ten times, and a
 * chip repeated per page reads as page-*specific*, which is the one thing those two are not.
 */

/** The colour chip's swatch, from `midi-surface-design/Edit.dc.html`. */
const COLOUR_SWATCH = "linear-gradient(90deg,#f43f5e,#3b82f6)"

type KindFilter = "all" | "group" | "fixture" | "look" | "cue" | "desk"
type FamilyFilter = "any" | AttributeFamily

const KIND_LABELS: Record<KindFilter, string> = {
  all: "All",
  group: "Groups",
  fixture: "Fixtures",
  look: "Looks",
  cue: "Cues",
  desk: "Desk",
}

interface LibraryChip {
  key: string
  label: string
  target: BindingTarget
  swatch: string | null
  /** Which family filter shows this chip. Null means "every family" — an action, not an attribute. */
  family: AttributeFamily | null
}

interface LibraryRow {
  key: string
  name: string
  detail: string
  badge: string
  kind: KindFilter
  /** Present on a group or fixture row: the whole row is draggable, and lands on a strip. */
  strip: { target: CueTarget } | null
  chips: LibraryChip[]
}

function propertyChip(
  keyPrefix: string,
  property: AvailableProperty,
  target: BindingTarget,
): LibraryChip {
  return {
    key: `${keyPrefix}:${property.name}`,
    label: property.displayName,
    target,
    swatch: property.type === "colour" ? COLOUR_SWATCH : null,
    family: familyForCategory(property.category),
  }
}

/**
 * A chip that is an *action* rather than an attribute — Go, Fire, Clear, Blackout, a bank.
 *
 * `family: null` is the load-bearing field and the reason this is a helper rather than a dozen
 * object literals: a chip filed under a family it does not belong to simply disappears when that
 * filter is off, with nothing to see and no compiler help. Naming the case once means it cannot be
 * mistyped at the thirteenth call site.
 */
function actionChip(key: string, label: string, target: BindingTarget): LibraryChip {
  return { key, label, target, swatch: null, family: null }
}

// ─── Drag sources ─────────────────────────────────────────────────────

function DragHandle({
  id,
  data,
  label,
  className,
  children,
}: {
  id: string
  data: SurfaceDragData
  label: string
  className?: string
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data })
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={label}
      className={cn("cursor-grab touch-none", isDragging && "opacity-35", className)}
    >
      {children}
    </button>
  )
}

function ChipButton({
  id,
  chip,
  dimmed,
}: {
  id: string
  chip: LibraryChip
  /** A drag is in flight and this chip is not it — the palette recedes so the picture reads. */
  dimmed: boolean
}) {
  return (
    <DragHandle
      id={id}
      data={{ type: "surface-chip", target: chip.target, label: chip.label, swatch: chip.swatch }}
      label={`Bind ${chip.label}`}
      className={cn(
        "inline-flex h-[22px] items-center gap-1 rounded-md border bg-card px-2 text-[11px] leading-3",
        dimmed && "opacity-40",
      )}
    >
      {chip.swatch && (
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-[2px]"
          style={{ background: chip.swatch }}
        />
      )}
      {chip.label}
    </DragHandle>
  )
}

function LibraryRowItem({
  row,
  onSurface,
  dragging,
}: {
  row: LibraryRow
  /** "strip 3" / "on 2 controls" — where this row already is. */
  onSurface: string | null
  dragging: boolean
}) {
  return (
    <div
      data-testid={`library-row:${row.key}`}
      className="flex items-start gap-2.5 border-t px-2.5 py-1.5 text-[13px] first:border-t-0"
    >
      {row.strip ? (
        <DragHandle
          id={`surface-row:${row.key}`}
          data={{
            type: "surface-row",
            target: row.strip.target,
            name: row.name,
            detail: row.detail,
          }}
          label={`Place ${row.name} on a strip`}
          className="mt-0.5 shrink-0 text-muted-foreground"
        >
          <GripVertical className="size-3.5" />
        </DragHandle>
      ) : (
        <span className="mt-0.5 w-3.5 shrink-0" aria-hidden />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{row.name}</span>
          <span className="truncate text-[11px] text-muted-foreground">{row.detail}</span>
          <span className="flex-1" />
          {onSurface && (
            <span className="inline-flex h-4 shrink-0 items-center rounded-full bg-muted px-1.5 text-[10px]">
              {onSurface}
            </span>
          )}
          <span className="inline-flex h-4 shrink-0 items-center rounded-full border px-1.5 text-[10px]">
            {row.badge}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {row.strip && (
            <DragHandle
              id={`surface-strip-chip:${row.key}`}
              data={{
                type: "surface-row",
                target: row.strip.target,
                name: row.name,
                detail: row.detail,
              }}
              label={`Place ${row.name} on a strip`}
              className={cn(
                "inline-flex h-[22px] items-center rounded-md border px-2 text-[11px] font-semibold leading-3",
                "border-primary/60 text-primary",
                dragging && "opacity-40",
              )}
            >
              Strip
            </DragHandle>
          )}
          {row.chips.map((chip) => (
            <ChipButton
              key={chip.key}
              id={`surface-chip:${row.key}:${chip.key}`}
              chip={chip}
              dimmed={dragging}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Per-target rows ──────────────────────────────────────────────────

/**
 * A group's or fixture's chips need that target's properties, and `useTargetProperties` is a hook —
 * so the row is a component. One query per group row, which is what `/groups` already does with a
 * card per group; a fixture row costs nothing extra, the whole patch being one request.
 *
 * **It takes the target as two primitives and mints the object here**, and it is memoized. Both
 * halves are needed and neither works alone: a `{ type, key }` literal built in the caller's `.map`
 * is a fresh identity every render, which defeats `useTargetProperties`' own memo *and* this
 * component's — so a keystroke in the search box would re-run the property map and sort for every
 * visible row on a rig with hundreds of fixtures.
 */
const TargetRowItem = memo(function TargetRowItem({
  targetType,
  targetKey,
  name,
  detail,
  badge,
  kind,
  family,
  onSurface,
  dragging,
}: {
  targetType: CueTarget["type"]
  targetKey: string
  name: string
  detail: string
  badge: string
  kind: KindFilter
  family: FamilyFilter
  onSurface: string | null
  dragging: boolean
}) {
  const target = useMemo<CueTarget>(
    () => ({ type: targetType, key: targetKey }),
    [targetType, targetKey],
  )
  const { properties } = useTargetProperties(target)

  const row = useMemo<LibraryRow>(() => {
    const chips: LibraryChip[] = properties
      .filter((property) => property.continuous)
      .map((property) =>
        propertyChip(
          `${target.type}:${target.key}`,
          property,
          target.type === "group"
            ? { type: "groupProperty", groupName: target.key, propertyName: property.name }
            : { type: "fixtureProperty", fixtureKey: target.key, propertyName: property.name },
        ),
      )
    // The strip's own select role, offered on its own so a select button can be put anywhere.
    chips.push(actionChip("select", "select", { type: "selectTarget", target, mode: "toggle" }))
    return {
      key: `${target.type}:${target.key}`,
      name,
      detail,
      badge,
      kind,
      strip: { target },
      chips,
    }
  }, [properties, target, name, detail, badge, kind])

  const shown = useMemo(() => filterChips(row, family), [row, family])
  if (shown == null) return null
  return <LibraryRowItem row={shown} onSurface={onSurface} dragging={dragging} />
})

/**
 * A family filter hides *chips*, and a row with nothing left with it.
 *
 * The busk palette's family row partitions its records; here the records are targets and a target
 * has every family its heads have, so the only thing a family can usefully select is which
 * attributes to bind. A row's `Strip` handle is a whole-strip gesture covering every family, so it
 * survives the filter — and keeps its row on screen.
 */
function filterChips(row: LibraryRow, family: FamilyFilter): LibraryRow | null {
  if (family === "any") return row
  const chips = row.chips.filter((chip) => chip.family === null || chip.family === family)
  if (chips.length === 0 && row.strip == null) return null
  return { ...row, chips }
}

// ─── The palette ──────────────────────────────────────────────────────

export interface SurfaceLibraryProps {
  projectId: number
  /** The selected device's banks, for the Desk row's *Bank A / B* chips. */
  banks: readonly BankDefinition[]
  deviceTypeKey: string
  /**
   * `type:key` → where that record already sits on the bank being drawn: `strip 3`, `on 2 controls`.
   * Built by `describePlacements` in `routes/Surfaces.tsx`.
   */
  placements: ReadonlyMap<string, string>
}

export function SurfaceLibrary({
  projectId,
  banks,
  deviceTypeKey,
  placements,
}: SurfaceLibraryProps) {
  const { data: groups } = useGroupListQuery()
  const { data: fixtures } = useFixtureListQuery()
  const { data: stacks } = useProjectCueStackListQuery(projectId)
  const { data: looks } = useLookListQuery({ projectId })
  const { data: templates } = useTemplateListQuery({ projectId })
  const { data: pages } = useBuskPagesQuery(projectId)
  const rigProperties = useRigProperties()
  const [search, setSearch] = useState("")
  const [kind, setKind] = useState<KindFilter>("all")
  const [family, setFamily] = useState<FamilyFilter>("any")
  const dragging = useSurfaceDragging()

  const continuousProperties = useMemo(
    () => rigProperties.filter((property) => property.continuous),
    [rigProperties],
  )

  /** The rows that are not one target's — Selection, Encoder bank, stacks, cues, Desk. */
  const rows = useMemo<LibraryRow[]>(() => {
    const out: LibraryRow[] = []

    out.push({
      key: "selection",
      name: "Selection",
      detail: "whatever is selected",
      badge: "Selection",
      kind: "desk",
      strip: null,
      chips: [
        ...continuousProperties.map((property) =>
          propertyChip("sel", property, {
            type: "selectionProperty",
            propertyName: property.name,
          }),
        ),
        actionChip("clear", "Clear", { type: "clearSelection" }),
        actionChip("locate", "Locate", { type: "locateSelection" }),
      ],
    })

    out.push({
      key: "encoder-bank",
      name: "Encoder bank",
      detail: "strip encoders",
      badge: "Desk",
      kind: "desk",
      strip: null,
      chips: continuousProperties.map((property) =>
        propertyChip("bank", property, {
          type: "encoderBankSet",
          propertyName: property.name,
        }),
      ),
    })

    for (const stack of stacks ?? []) {
      if (stack.type !== "STACK") continue
      out.push({
        key: `stack:${stack.id}`,
        name: stack.name,
        detail: `${stack.cues.length} ${stack.cues.length === 1 ? "cue" : "cues"}`,
        badge: "Stack",
        kind: "cue",
        strip: null,
        chips: [
          actionChip("go", "Go", { type: "cueStackGo", stackId: stack.id }),
          actionChip("back", "Back", { type: "cueStackBack", stackId: stack.id }),
          actionChip("pause", "Pause", { type: "cueStackPause", stackId: stack.id }),
        ],
      })
      for (const cue of stack.cues) {
        // A MARKER cannot be fired, so a binding on one would be dead on arrival.
        if (cue.cueType === "MARKER") continue
        out.push({
          key: `cue:${cue.id}`,
          name: cue.name,
          detail: `${cue.cueNumber} · ${stack.name}`,
          badge: "Cue",
          kind: "cue",
          strip: null,
          chips: [
            actionChip("fire", "Fire", { type: "fireCue", cueId: cue.id }),
          ],
        })
      }
    }

    // Records on buttons (D6). Each is a **plain row with chips** rather than a `TargetRowItem`:
    // that component exists to mount `useTargetProperties` per group or fixture and is memoized on
    // primitive target props for exactly that reason, and none of these has a per-target property
    // lookup to do.
    for (const template of templates ?? []) {
      out.push({
        key: `template:${template.uuid}`,
        name: template.name,
        detail: `${template.family?.toLowerCase() ?? "value"} template`,
        badge: "Template",
        kind: "look",
        strip: null,
        chips: [
          // A template is exactly one family (never `null` — the write boundary validates that),
          // unlike a Look's Apply chip below, which stays family-agnostic because a Look spans
          // families by nature. `actionChip` would give this `family: null` and the family filter
          // would never hide it, so it's built by hand instead.
          {
            key: "press",
            label: "Press",
            target: { type: "pressTemplate", templateUuid: template.uuid },
            swatch: null,
            family: template.family,
          },
        ],
      })
    }

    for (const look of looks ?? []) {
      out.push({
        key: `look:${look.uuid}`,
        name: look.name,
        detail: look.hasDeferredEffects ? "needs a selection" : "bound",
        badge: "Look",
        kind: "look",
        strip: null,
        // A Look with a deferred effect presses onto targets it does not have, and the write
        // boundary refuses it by name — so it is offered with no chip at all rather than with one
        // that 400s. The detail line above is what says why.
        chips: look.hasDeferredEffects
          ? []
          : [actionChip("apply", "Apply", { type: "applyLook", lookUuid: look.uuid })],
      })
    }

    for (const page of pages ?? []) {
      // A pad this client minted and has not saved has no uuid to bind to. It cannot occur in a
      // fetched page, but the type allows it and an empty uuid would save.
      const pads = allPads(page).filter((pad) => pad.uuid != null)
      out.push({
        key: `busk-page:${page.uuid}`,
        name: `Busk · ${page.name}`,
        detail: `page · ${pads.length} ${pads.length === 1 ? "pad" : "pads"}`,
        badge: "Busk",
        kind: "desk",
        strip: null,
        chips: [
          actionChip("page", "Page", { type: "buskPageSet", pageUuid: page.uuid }),
          ...pads.map((pad) =>
            actionChip(`pad:${pad.uuid}`, padFaceOf(pad).name, {
              type: "pressPad",
              padUuid: pad.uuid!,
            }),
          ),
        ],
      })
    }

    out.push({
      key: "desk",
      name: "Desk",
      detail: "whole rig",
      badge: "Desk",
      kind: "desk",
      strip: null,
      chips: [
        actionChip("blackout", "Blackout", { type: "blackout" }),
        actionChip("gm", "Grand master", { type: "grandMasterToggle" }),
        ...banks.map((bank) =>
          actionChip(`bank:${bank.id}`, `Bank ${bank.name}`, {
            type: "setBank",
            deviceTypeKey,
            bank: bank.id,
          }),
        ),
        // `null` is master 1 by the same convention as everywhere else, and master 1 always
        // exists — so these two are useful before the speed-master bank has even loaded.
        actionChip("tap", "Tap M1", { type: "speedMasterTap", masterUuid: null }),
        actionChip("bpm", "BPM", {
          type: "speedMasterBpm",
          masterUuid: null,
          minBpm: 60,
          maxBpm: 180,
        }),
        // Here, not on each page's row: they are page-agnostic, and a chip repeated once per page
        // reads as page-specific.
        actionChip("page-next", "Next page", { type: "buskPageNext" }),
        actionChip("page-prev", "Prev page", { type: "buskPagePrev" }),
      ],
    })

    return out
  }, [continuousProperties, stacks, banks, deviceTypeKey, looks, templates, pages])

  const needle = search.trim().toLowerCase()
  const matches = (name: string) => needle.length === 0 || name.toLowerCase().includes(needle)
  const showKind = (rowKind: KindFilter) => kind === "all" || kind === rowKind

  const otherRows = rows
    .filter((row) => showKind(row.kind) && matches(row.name))
    .map((row) => filterChips(row, family))
    .filter((row): row is LibraryRow => row != null)

  const shownGroups = showKind("group") ? (groups ?? []).filter((g) => matches(g.name)) : []
  const shownFixtures = showKind("fixture") ? (fixtures ?? []).filter((f) => matches(f.name)) : []
  const isEmpty = shownGroups.length === 0 && shownFixtures.length === 0 && otherRows.length === 0

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-2 border-b px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Library
          </span>
          <span className="flex-1" />
          <span className="text-[11px] text-muted-foreground">row → a strip · chip → one control</span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            aria-label="Search the binding library"
            className="h-7 pl-7 text-[13px]"
          />
        </div>
        <div className="flex items-center gap-0.5 rounded-[10px] border bg-card p-0.5">
          {(Object.keys(KIND_LABELS) as KindFilter[]).map((value) => (
            <SegButton
              key={value}
              active={kind === value}
              onClick={() => setKind(value)}
              className="flex-1"
            >
              {KIND_LABELS[value]}
            </SegButton>
          ))}
        </div>
        <div className="flex w-fit items-center gap-0.5 rounded-[10px] border bg-card p-0.5">
          <SegButton active={family === "any"} onClick={() => setFamily("any")}>
            Any family
          </SegButton>
          {ATTRIBUTE_FAMILIES.map((value) => (
            <SegButton key={value} active={family === value} onClick={() => setFamily(value)}>
              {FAMILY_LABELS[value].singular}
            </SegButton>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isEmpty ? (
          <p className="p-4 text-center text-[12px] text-muted-foreground">
            Nothing here matches. Clear the search or the filters.
          </p>
        ) : (
          <>
            {shownGroups.map((group) => (
              <TargetRowItem
                key={`group:${group.name}`}
                targetType="group"
                targetKey={group.name}
                name={group.name}
                detail={`${group.memberCount} ${group.memberCount === 1 ? "fixture" : "fixtures"}`}
                badge="Group"
                kind="group"
                family={family}
                onSurface={placements.get(`group:${group.name}`) ?? null}
                dragging={dragging}
              />
            ))}
            {shownFixtures.map((fixture) => (
              <TargetRowItem
                key={`fixture:${fixture.key}`}
                targetType="fixture"
                targetKey={fixture.key}
                name={fixture.name}
                detail={fixture.model ?? fixture.typeKey}
                badge="Fixture"
                kind="fixture"
                family={family}
                onSurface={placements.get(`fixture:${fixture.key}`) ?? null}
                dragging={dragging}
              />
            ))}
            {otherRows.map((row) => (
              <LibraryRowItem
                key={row.key}
                row={row}
                onSurface={placements.get(row.key) ?? null}
                dragging={dragging}
              />
            ))}
          </>
        )}
      </div>

      <div className="shrink-0 border-t px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        Drop a row on a strip and its fader, select, encoder and flash follow. Any control can still
        be bound on its own.
      </div>
    </div>
  )
}

function SegButton({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg px-2 py-1 text-xs font-semibold transition-colors",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  )
}

/**
 * Is a surface drag in flight?
 *
 * Once for the whole palette, not per chip: it is a monitor subscription, and one per chip would
 * be a hundred re-renders at drag start. It answers only for *this* surface's drags, so a busk pad
 * lifted elsewhere leaves the palette alone.
 */
function useSurfaceDragging(): boolean {
  const [dragging, setDragging] = useState(false)
  useDndMonitor({
    onDragStart(event) {
      setDragging(surfaceDragData(event.active) != null)
    },
    onDragEnd() {
      setDragging(false)
    },
    onDragCancel() {
      setDragging(false)
    },
  })
  return dragging
}

/**
 * Registered at module scope so the app shell's single `<DragOverlay>` can draw a surface ghost
 * without its import graph ever reaching this file. A surface drag cannot happen without this
 * module being loaded.
 *
 * The two ghosts are the busk page's two, in its geometry: the bank ghost for a row (it covers a
 * whole column) and the pad ghost for a chip (it covers one control).
 */
registerDragOverlay((active) => {
  const data = surfaceDragData(active)
  if (data == null) return null
  if (data.type === "surface-row") {
    return (
      <div
        className="w-[130px] rounded-[10px] border border-primary bg-card p-2.5 opacity-90 shadow-lg"
        style={{ transform: "rotate(-2deg)" }}
      >
        <div className="truncate text-[11px] font-semibold">{data.name}</div>
        <div className="mt-1 text-[10px] text-muted-foreground">{data.detail} · strip</div>
      </div>
    )
  }
  return (
    <div
      className="inline-flex h-[22px] items-center gap-1 rounded-md border border-primary bg-card px-2 text-[11px] leading-3 opacity-90 shadow-lg"
      style={{ transform: "rotate(-2deg)" }}
    >
      {data.swatch && (
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-[2px]"
          style={{ background: data.swatch }}
        />
      )}
      {data.label}
    </div>
  )
})
