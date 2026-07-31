import { memo, useMemo } from 'react'
import type { StageRegionDto } from '../../api/stageRegionApi'
import type { RiggingDto } from '../../api/riggingApi'
import type { FixturePatch } from '../../api/patchApi'
import { worldCornersFor, worldEndpointsFor } from '../../lib/stageGeometry'
import { project, type ScreenPoint, type StageProjection } from '../../lib/stageProjection'

/** Rendered bar thickness. Mirrors RIGGING_THICKNESS_M in RiggingMeshes. */
const RIGGING_THICKNESS_M = 0.18
/** A rigging whose projected length is under this is edge-on to the viewer. */
export const DEGENERATE_LENGTH_M = 1e-6

const FIXTURE_DOT_PX = 7
const FIXTURE_HIT_PX = 14
const LABEL_PX = 11

// — regions ————————————————————————————————————————————————————————

/**
 * A region's outline in the given projection.
 *
 * In plan the four floor corners already form the visible rectangle (yawed, so a
 * polygon rather than a rect). In an elevation a yawed box has no axis-aligned
 * outline, so the bounding rectangle of all eight projected corners is both
 * honest about the space it occupies and cheap.
 */
export function regionOutline(
  region: StageRegionDto,
  projection: StageProjection,
): { kind: 'polygon'; points: ScreenPoint[] } | { kind: 'rect'; points: ScreenPoint[] } {
  const corners = worldCornersFor(region).map(([x, y, z]) => project({ x, y, z }, projection))
  if (projection.id === 'plan') {
    return { kind: 'polygon', points: corners.slice(0, 4) }
  }
  return { kind: 'rect', points: corners }
}

function boundsOf(points: ScreenPoint[]) {
  const hs = points.map((p) => p.h)
  const vs = points.map((p) => p.v)
  const hMin = Math.min(...hs)
  const vMin = Math.min(...vs)
  return { h: hMin, v: vMin, w: Math.max(...hs) - hMin, hgt: Math.max(...vs) - vMin }
}

/**
 * Per-region hue, derived from the uuid. Mirrors the palette rule in
 * StageRegionMeshes so a region is the same colour in 2D as in 3D.
 */
function regionHue(uuid: string): number {
  let hash = 0
  for (let i = 0; i < uuid.length; i++) hash = (hash * 31 + uuid.charCodeAt(i)) | 0
  return Math.abs(hash) % 360
}

/**
 * Cursor for a shape the user might move.
 *
 * Matches the 3D rule that a shape must be selected before its body becomes a
 * drag handle — click to select, then drag to move. Showing `grab` only once
 * selected is what makes that discoverable.
 */
function bodyCursor(selected: boolean, editMode: boolean): 'grab' | 'pointer' {
  return editMode && selected ? 'grab' : 'pointer'
}

interface RegionShapesProps {
  regions: StageRegionDto[]
  projection: StageProjection
  selectedUuid: string | null
  interactive: boolean
  /** Enables the move cursor on the selected shape. */
  editMode?: boolean
  onPick?: (region: StageRegionDto, e: React.PointerEvent) => void
}

export const RegionShapes = memo(function RegionShapes({
  regions,
  projection,
  selectedUuid,
  interactive,
  editMode = false,
  onPick,
}: RegionShapesProps) {
  return (
    <g>
      {regions.map((region) => {
        const outline = regionOutline(region, projection)
        const selected = region.uuid === selectedUuid
        const hue = regionHue(region.uuid)
        const stroke = `hsl(${hue} 60% ${selected ? 72 : 55}%)`
        const fill = `hsl(${hue} 55% 50% / ${selected ? 0.28 : 0.14})`
        const common = {
          fill,
          stroke,
          strokeWidth: selected ? 2 : 1,
          vectorEffect: 'non-scaling-stroke' as const,
          pointerEvents: (interactive ? 'all' : 'none') as 'all' | 'none',
          onPointerDown: interactive && onPick ? (e: React.PointerEvent) => onPick(region, e) : undefined,
          style: interactive ? { cursor: bodyCursor(selected, editMode) } : undefined,
        }
        if (outline.kind === 'polygon') {
          return (
            <polygon
              key={region.uuid}
              points={outline.points.map((p) => `${p.h},${p.v}`).join(' ')}
              {...common}
            />
          )
        }
        const b = boundsOf(outline.points)
        return <rect key={region.uuid} x={b.h} y={b.v} width={b.w} height={b.hgt} {...common} />
      })}
    </g>
  )
})

// — riggings ————————————————————————————————————————————————————————

export interface ProjectedRigging {
  rig: RiggingDto
  a: ScreenPoint
  b: ScreenPoint
  /** Projected length. Near zero means the bar points at the viewer. */
  lengthOnScreen: number
  degenerate: boolean
}

export function projectRigging(rig: RiggingDto, projection: StageProjection): ProjectedRigging {
  const [wa, wb] = worldEndpointsFor(rig)
  const a = project(wa, projection)
  const b = project(wb, projection)
  const lengthOnScreen = Math.hypot(b.h - a.h, b.v - a.v)
  return { rig, a, b, lengthOnScreen, degenerate: lengthOnScreen < DEGENERATE_LENGTH_M }
}

interface RiggingShapesProps {
  riggings: RiggingDto[]
  projection: StageProjection
  selectedUuid: string | null
  /** Bar a fixture is being dragged over — highlighted as the drop target. */
  dropTargetUuid?: string | null
  interactive: boolean
  editMode?: boolean
  showLabels: boolean
  mPerPx: number
  onPick?: (rig: RiggingDto, e: React.PointerEvent) => void
}

export const RiggingShapes = memo(function RiggingShapes({
  riggings,
  projection,
  selectedUuid,
  dropTargetUuid,
  interactive,
  editMode = false,
  showLabels,
  mPerPx,
  onPick,
}: RiggingShapesProps) {
  return (
    <g>
      {riggings.map((rig) => {
        const { a, b, degenerate } = projectRigging(rig, projection)
        const selected = rig.uuid === selectedUuid
        const isDropTarget = rig.uuid === dropTargetUuid
        // Green rather than the selection yellow: this is "release here to hang
        // on this bar", which is a different thing from "this is selected".
        const colour = isDropTarget ? '#7fe0a0' : selected ? '#c8d3e2' : '#9aa5b4'
        const handlers = {
          pointerEvents: (interactive ? 'all' : 'none') as 'all' | 'none',
          onPointerDown:
            interactive && onPick ? (e: React.PointerEvent) => onPick(rig, e) : undefined,
          // An edge-on bar can still be selected, but not dragged in this view —
          // don't offer a grab cursor for a gesture that will be refused.
          style: interactive
            ? { cursor: degenerate ? 'pointer' : bodyCursor(selected, editMode) }
            : undefined,
        }

        // Edge-on: the bar runs along this projection's depth axis, so it has no
        // extent to draw. A ring marks it as present-but-not-adjustable here
        // rather than collapsing to an invisible zero-length line.
        if (degenerate) {
          return (
            <circle
              key={rig.uuid}
              cx={a.h}
              cy={a.v}
              r={RIGGING_THICKNESS_M}
              fill="none"
              stroke={colour}
              strokeWidth={selected ? 2.5 : 1.5}
              vectorEffect="non-scaling-stroke"
              {...handlers}
            />
          )
        }

        const mid = { h: (a.h + b.h) / 2, v: (a.v + b.v) / 2 }
        return (
          <g key={rig.uuid}>
            <line
              x1={a.h}
              y1={a.v}
              x2={b.h}
              y2={b.v}
              stroke={colour}
              strokeWidth={RIGGING_THICKNESS_M}
              strokeLinecap="butt"
              {...handlers}
            />
            {(selected || isDropTarget) && (
              <line
                x1={a.h}
                y1={a.v}
                x2={b.h}
                y2={b.v}
                stroke={isDropTarget ? '#2fbf6a' : '#ffe082'}
                strokeWidth={isDropTarget ? 2.5 : 1.5}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            {showLabels && (
              <text
                x={mid.h}
                y={mid.v - RIGGING_THICKNESS_M}
                fontSize={LABEL_PX * mPerPx}
                textAnchor="middle"
                className="fill-muted-foreground"
                pointerEvents="none"
              >
                {rig.name}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
})

// — fixtures ————————————————————————————————————————————————————————

export interface ProjectedFixture {
  patch: FixturePatch
  screen: ScreenPoint
}

interface FixtureShapesProps {
  fixtures: ProjectedFixture[]
  /** The anchor — drawn with the strongest highlight. */
  selectedKey: string | null
  /** Every selected object's key (`patch:<key>` form), for multi-select. */
  selectedKeys?: ReadonlySet<string>
  dimmedKeys?: ReadonlySet<string> | null
  showLabels: boolean
  mPerPx: number
  interactive: boolean
  editMode?: boolean
  onPick?: (patch: FixturePatch, e: React.PointerEvent) => void
  colourFor: (patch: FixturePatch) => string
}

/**
 * Chooses which fixture labels to draw.
 *
 * A real rig puts many fixtures on the same bar or the same downstage line, so
 * drawing every label produces an unreadable smear — a dozen names overprinted
 * on one pixel row. Greedily keep a label only when its box doesn't overlap one
 * already kept, working outward from the top-left so the choice is stable as the
 * user pans. O(n²), but n is fixtures-on-a-stage, and only when labels are on.
 *
 * The selected fixture always wins: its label is the one the user is looking for.
 */
function labelledKeys(
  fixtures: ProjectedFixture[],
  selectedKey: string | null,
  mPerPx: number,
): Set<string> {
  const lineH = LABEL_PX * mPerPx
  // ~0.55em average glyph advance is close enough for collision purposes.
  const widthOf = (text: string) => text.length * 0.55 * LABEL_PX * mPerPx

  const ordered = [...fixtures].sort((a, b) => {
    if (a.patch.key === selectedKey) return -1
    if (b.patch.key === selectedKey) return 1
    return a.screen.v - b.screen.v || a.screen.h - b.screen.h
  })

  const placed: Array<{ h0: number; h1: number; v0: number; v1: number }> = []
  const keep = new Set<string>()
  for (const { patch, screen } of ordered) {
    const w = widthOf(patch.displayName || patch.key)
    const box = {
      h0: screen.h - w / 2,
      h1: screen.h + w / 2,
      v0: screen.v - lineH * 2,
      v1: screen.v - lineH * 0.5,
    }
    const clashes = placed.some(
      (p) => box.h0 < p.h1 && box.h1 > p.h0 && box.v0 < p.v1 && box.v1 > p.v0,
    )
    if (clashes) continue
    placed.push(box)
    keep.add(patch.key)
  }
  return keep
}

export const FixtureShapes = memo(function FixtureShapes({
  fixtures,
  selectedKey,
  selectedKeys,
  dimmedKeys,
  showLabels,
  mPerPx,
  interactive,
  editMode = false,
  onPick,
  colourFor,
}: FixtureShapesProps) {
  const r = FIXTURE_DOT_PX * mPerPx
  const hitR = FIXTURE_HIT_PX * mPerPx
  const labelled = useMemo(
    () => (showLabels ? labelledKeys(fixtures, selectedKey, mPerPx) : null),
    [showLabels, fixtures, selectedKey, mPerPx],
  )
  return (
    <g>
      {fixtures.map(({ patch, screen }) => {
        // The anchor gets the full highlight; other members of a multi-selection
        // get a lighter ring, so it's clear which one the side panel is editing.
        const selected = patch.key === selectedKey
        const inSelection = selected || (selectedKeys?.has(`patch:${patch.key}`) ?? false)
        const dimmed = dimmedKeys?.size ? !dimmedKeys.has(patch.key) : false
        return (
          <g key={patch.id} opacity={dimmed ? 0.3 : 1}>
            {/* Invisible hit target: a 7px dot is far below the ~44px a finger
                needs, and editing is enabled on tablets. */}
            {interactive && (
              <circle
                cx={screen.h}
                cy={screen.v}
                r={hitR}
                fill="transparent"
                pointerEvents="all"
                style={{ cursor: bodyCursor(selected, editMode) }}
                onPointerDown={onPick ? (e) => onPick(patch, e) : undefined}
              />
            )}
            {/* Outline via a Tailwind class rather than a literal, so a pale
                tungsten dot stays visible against a light background. CSS beats
                the presentation attribute, hence the attribute is only set for
                the selected highlight. */}
            <circle
              cx={screen.h}
              cy={screen.v}
              r={r}
              fill={colourFor(patch)}
              className={inSelection ? undefined : 'stroke-foreground/40'}
              stroke={selected ? '#ffe082' : inSelection ? '#b08d2e' : undefined}
              strokeWidth={selected ? 2.5 : inSelection ? 2 : 1}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            {patch.stageHidden && (
              <line
                x1={screen.h - r}
                y1={screen.v + r}
                x2={screen.h + r}
                y2={screen.v - r}
                stroke="var(--color-background)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            {labelled?.has(patch.key) && (
              <text
                x={screen.h}
                y={screen.v - r - 2 * mPerPx}
                fontSize={LABEL_PX * mPerPx}
                textAnchor="middle"
                className={selected ? 'fill-foreground' : 'fill-muted-foreground'}
                pointerEvents="none"
              >
                {patch.displayName || patch.key}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
})
