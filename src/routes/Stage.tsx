import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Loader2, Pencil, Plus } from 'lucide-react'
import { useViewedProject } from '../ProjectSwitcher'
import { useCurrentProjectQuery } from '../store/projects'
import { store } from '../store'
import { patchesApi, useUpdatePatchMutation, usePatchListQuery } from '../store/patches'
import { stageRegionsApi, useUpdateStageRegionMutation, useStageRegionListQuery } from '../store/stageRegions'
import { riggingsApi, useUpdateRiggingMutation, useRiggingListQuery } from '../store/riggings'
import { Stage3D, type Selection } from '../components/stage3d/Stage3D'
import { clearComposedWorldPosition } from '../lib/stageCoords'
import { StageOverviewPanel } from '../components/StageOverviewPanel'
import { EditPatchSheet, type EditPatchSheetHandle } from '../components/patches/EditPatchSheet'
import { EditStageRegionSheet, type EditStageRegionSheetHandle } from '../components/stage/EditStageRegionSheet'
import { EditRiggingSheet, type EditRiggingSheetHandle } from '../components/rigging/EditRiggingSheet'
import { useMediaQuery, SM_BREAKPOINT } from '../hooks/useMediaQuery'

type Mode = '2d' | '3d'

const STORAGE_KEY = 'stageViewMode'

function loadMode(): Mode {
  if (typeof window === 'undefined') return '3d'
  const v = window.localStorage.getItem(STORAGE_KEY)
  return v === '2d' ? '2d' : '3d'
}

function useStageViewMode(): [Mode, (m: Mode) => void] {
  const [mode, setModeState] = useState<Mode>(loadMode)
  const setMode = (m: Mode) => {
    setModeState(m)
    try {
      window.localStorage.setItem(STORAGE_KEY, m)
    } catch {
      // ignore quota / private mode failures
    }
  }
  return [mode, setMode]
}

type SheetState =
  | { kind: 'patch'; patchKey: string }
  | { kind: 'region'; uuid: string | null }
  | { kind: 'rigging'; uuid: string | null }
  | null

// Returns the entry whose uuid matches, or null if uuid is undefined/null/missing.
// Lets callers skip an outer "did the user pick something?" guard.
function findByUuid<T extends { uuid: string }>(list: T[] | undefined, uuid: string | null | undefined): T | null {
  if (uuid == null) return null
  return list?.find((x) => x.uuid === uuid) ?? null
}

export function Stage() {
  const project = useViewedProject()
  const projectId = project?.id
  const [mode, setMode] = useStageViewMode()
  const [selection, setSelection] = useState<Selection>(null)
  const [editMode, setEditMode] = useState(false)
  const [sheetOpenFor, setSheetOpenFor] = useState<SheetState>(null)
  const isTabletOrLarger = useMediaQuery(SM_BREAKPOINT)

  const patchSheetRef = useRef<EditPatchSheetHandle>(null)
  const regionSheetRef = useRef<EditStageRegionSheetHandle>(null)
  const riggingSheetRef = useRef<EditRiggingSheetHandle>(null)

  const { data: patches } = usePatchListQuery(projectId ?? 0, { skip: projectId == null })
  const { data: regions } = useStageRegionListQuery(projectId ?? 0, { skip: projectId == null })
  const { data: riggings } = useRiggingListQuery(projectId ?? 0, { skip: projectId == null })

  const [updatePatch] = useUpdatePatchMutation()
  const [updateRegion] = useUpdateStageRegionMutation()
  const [updateRigging] = useUpdateRiggingMutation()

  // 3D-mode-only affordances. Editing also requires tablet+ width.
  const showEditToggle = mode === '3d' && isTabletOrLarger
  const editingActive = mode === '3d' && editMode && isTabletOrLarger

  // Drop selection + close sheet when leaving 3D or edit mode.
  useEffect(() => {
    if (mode !== '3d' || !editMode) {
      setSelection(null)
      setSheetOpenFor(null)
    }
  }, [mode, editMode])

  // Drop edit mode if viewport shrinks below tablet.
  useEffect(() => {
    if (!isTabletOrLarger && editMode) setEditMode(false)
  }, [isTabletOrLarger, editMode])

  if (projectId == null) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  const sheetPatch =
    sheetOpenFor?.kind === 'patch' ? patches?.find((p) => p.key === sheetOpenFor.patchKey) ?? null : null
  const sheetRegion = findByUuid(regions, sheetOpenFor?.kind === 'region' ? sheetOpenFor.uuid : undefined)
  const sheetRigging = findByUuid(riggings, sheetOpenFor?.kind === 'rigging' ? sheetOpenFor.uuid : undefined)

  const handleSelectionChange = (s: Selection) => {
    setSelection(s)
    if (!editingActive || s == null) return
    if (s.kind === 'patch') setSheetOpenFor({ kind: 'patch', patchKey: s.patchKey })
    else if (s.kind === 'region') setSheetOpenFor({ kind: 'region', uuid: s.uuid })
    else if (s.kind === 'rigging') setSheetOpenFor({ kind: 'rigging', uuid: s.uuid })
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full min-h-0">
        <header className="flex items-center gap-2 border-b px-4 py-2">
          <h1 className="text-sm font-semibold">Stage</h1>
          <div className="flex-1" />
          {editingActive && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSheetOpenFor({ kind: 'region', uuid: null })}
              >
                <Plus className="size-3.5 mr-1" />
                Region
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSheetOpenFor({ kind: 'rigging', uuid: null })}
              >
                <Plus className="size-3.5 mr-1" />
                Rigging
              </Button>
            </>
          )}
          {showEditToggle && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant={editMode ? 'default' : 'outline'}
                  onClick={() => setEditMode((v) => !v)}
                  aria-pressed={editMode}
                >
                  <Pencil className="size-3.5 mr-1" />
                  Edit
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {editMode ? 'Click an object to edit' : 'Enable visual editing'}
              </TooltipContent>
            </Tooltip>
          )}
          <ToggleGroup
            type="single"
            size="sm"
            value={mode}
            onValueChange={(v) => {
              if (v === '2d' || v === '3d') setMode(v)
            }}
          >
            <ToggleGroupItem value="3d">3D</ToggleGroupItem>
            <ToggleGroupItem value="2d">2D</ToggleGroupItem>
          </ToggleGroup>
        </header>
        <main className="flex-1 min-h-0 overflow-hidden">
          {mode === '3d' ? (
            <Stage3D
              projectId={projectId}
              editMode={editingActive}
              selection={selection}
              onSelectionChange={handleSelectionChange}
              onPatchPlacementChange={(patch, next, settled) => {
                patchSheetRef.current?.setPlacement({
                  riggingUuid: next.riggingUuid,
                  stageX: next.stageX,
                  stageY: next.stageY,
                  stageZ: next.stageZ,
                  baseYawDeg: patch.baseYawDeg,
                  basePitchDeg: patch.basePitchDeg,
                })
                if (!settled) return
                // TransformControls fires `dragging-changed: false` on every
                // mouseup, including click-without-drag — guard against firing
                // a no-op PUT (and the cache invalidation it would trigger).
                if (
                  next.riggingUuid === patch.riggingUuid &&
                  next.stageX === patch.stageX &&
                  next.stageY === patch.stageY &&
                  next.stageZ === patch.stageZ
                ) return
                // Optimistic write so the mesh stays put through the PUT round-trip.
                store.dispatch(
                  patchesApi.util.updateQueryData('patchList', projectId, (draft) => {
                    const p = draft.find((x) => x.id === patch.id)
                    if (!p) return
                    p.riggingUuid = next.riggingUuid
                    p.stageX = next.stageX
                    p.stageY = next.stageY
                    p.stageZ = next.stageZ
                    clearComposedWorldPosition(p)
                  }),
                )
                updatePatch({
                  projectId,
                  patchId: patch.id,
                  riggingUuid: next.riggingUuid,
                  stageX: next.stageX,
                  stageY: next.stageY,
                  stageZ: next.stageZ,
                }).catch(() => {})
              }}
              onRegionPositionChange={(region, next, settled) => {
                regionSheetRef.current?.setPosition({
                  centerX: next.centerX,
                  centerY: next.centerY,
                  centerZ: next.centerZ,
                  yawDeg: next.yawDeg,
                })
                if (!settled) return
                if (
                  next.centerX === region.centerX &&
                  next.centerY === region.centerY &&
                  next.centerZ === region.centerZ &&
                  next.yawDeg === region.yawDeg
                ) return
                store.dispatch(
                  stageRegionsApi.util.updateQueryData('stageRegionList', projectId, (draft) => {
                    const r = draft.find((x) => x.id === region.id)
                    if (!r) return
                    r.centerX = next.centerX
                    r.centerY = next.centerY
                    r.centerZ = next.centerZ
                    r.yawDeg = next.yawDeg
                  }),
                )
                updateRegion({
                  projectId,
                  regionId: region.id,
                  centerX: next.centerX,
                  centerY: next.centerY,
                  centerZ: next.centerZ,
                  yawDeg: next.yawDeg,
                }).catch(() => {})
              }}
              onRiggingPositionChange={(rig, next, settled) => {
                riggingSheetRef.current?.setPosition({
                  positionX: next.positionX,
                  positionY: next.positionY,
                  positionZ: next.positionZ,
                  yawDeg: next.yawDeg,
                  pitchDeg: next.pitchDeg,
                  rollDeg: next.rollDeg,
                })
                if (!settled) return
                if (
                  next.positionX === rig.positionX &&
                  next.positionY === rig.positionY &&
                  next.positionZ === rig.positionZ &&
                  next.yawDeg === rig.yawDeg &&
                  next.pitchDeg === rig.pitchDeg &&
                  next.rollDeg === rig.rollDeg
                ) return
                store.dispatch(
                  riggingsApi.util.updateQueryData('riggingList', projectId, (draft) => {
                    const r = draft.find((x) => x.id === rig.id)
                    if (!r) return
                    r.positionX = next.positionX
                    r.positionY = next.positionY
                    r.positionZ = next.positionZ
                    r.yawDeg = next.yawDeg
                    r.pitchDeg = next.pitchDeg
                    r.rollDeg = next.rollDeg
                  }),
                )
                updateRigging({
                  projectId,
                  riggingId: rig.id,
                  positionX: next.positionX,
                  positionY: next.positionY,
                  positionZ: next.positionZ,
                  yawDeg: next.yawDeg,
                  pitchDeg: next.pitchDeg,
                  rollDeg: next.rollDeg,
                }).catch(() => {})
              }}
            />
          ) : (
            <StageOverviewPanel
              isVisible
              selectedFixtureKey={selection?.kind === 'patch' ? selection.patchKey : null}
              onFixtureClick={(key) => setSelection({ kind: 'patch', patchKey: key })}
            />
          )}
        </main>

        <EditPatchSheet
          ref={patchSheetRef}
          open={sheetOpenFor?.kind === 'patch' && sheetPatch != null}
          onOpenChange={(open) => {
            if (!open) setSheetOpenFor(null)
          }}
          patch={sheetPatch}
          projectId={projectId}
          existingPatches={patches ?? []}
        />
        <EditStageRegionSheet
          ref={regionSheetRef}
          open={sheetOpenFor?.kind === 'region'}
          onOpenChange={(open) => {
            if (!open) setSheetOpenFor(null)
          }}
          region={sheetRegion}
          projectId={projectId}
        />
        <EditRiggingSheet
          ref={riggingSheetRef}
          open={sheetOpenFor?.kind === 'rigging'}
          onOpenChange={(open) => {
            if (!open) setSheetOpenFor(null)
          }}
          rigging={sheetRigging}
          projectId={projectId}
        />
      </div>
    </TooltipProvider>
  )
}

// Bare /stage redirect — follow current project, mirror FixturesRedirect.
export function StageRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/stage`, { replace: true })
    }
  }, [currentProject, isLoading, navigate])

  if (isLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  return <Navigate to="/projects" replace />
}
