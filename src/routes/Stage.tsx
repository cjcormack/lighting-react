import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Loader2, Pencil, Plus } from 'lucide-react'
import { useViewedProject } from '../ProjectSwitcher'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import { store } from '../store'
import { patchesApi, useUpdatePatchMutation, usePatchListQuery } from '../store/patches'
import {
  stageRegionsApi,
  useUpdateStageRegionMutation,
  useStageRegionListQuery,
  useCreateStageRegionMutation,
} from '../store/stageRegions'
import {
  riggingsApi,
  useUpdateRiggingMutation,
  useRiggingListQuery,
  useCreateRiggingMutation,
} from '../store/riggings'
import { formatError } from '../lib/formatError'
import { Stage3D, type Selection } from '../components/stage3d/Stage3D'
import { DEFAULT_RIGGING_LENGTH_M } from '../components/stage3d/RiggingMeshes'
import { StageViewMenu } from '../components/stage3d/StageViewMenu'
import { useStageView } from '../components/stage3d/useStageView'
import { clearComposedWorldPosition } from '../lib/stageCoords'
import { StageOverviewPanel } from '../components/StageOverviewPanel'
import {
  StageEditorPanel,
  StageEditorPanelStub,
  type StageEditorTarget,
} from '../components/stage3d/StageEditorPanel'
import type { EditPatchFormHandle } from '../components/patches/EditPatchForm'
import type { EditStageRegionFormHandle } from '../components/stage/EditStageRegionForm'
import type { EditRiggingFormHandle } from '../components/rigging/EditRiggingForm'
import type { FixturePatch } from '../api/patchApi'
import type { StageRegionDto } from '../api/stageRegionApi'
import type { RiggingDto } from '../api/riggingApi'
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

const REGION_DEFAULT_SIZE_M = 2
// Fallback truss height when the project doesn't declare a stage height.
const FALLBACK_TRUSS_HEIGHT_M = 4.5

function findByUuid<T extends { uuid: string }>(list: T[] | undefined, uuid: string | null | undefined): T | null {
  if (uuid == null) return null
  return list?.find((x) => x.uuid === uuid) ?? null
}

function isEditableTarget(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true
  return el instanceof HTMLElement && el.isContentEditable
}

function nextDefaultName(prefix: string, existing: { name: string }[] | undefined): string {
  // Pick (max trailing-number of "Prefix N" entries) + 1, or "Prefix 1" if none.
  const re = new RegExp(`^${prefix}\\s+(\\d+)$`)
  let max = 0
  for (const item of existing ?? []) {
    const m = re.exec(item.name)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix} ${max + 1}`
}

export function Stage() {
  const project = useViewedProject()
  const projectId = project?.id
  const [mode, setMode] = useStageViewMode()
  const [selection, setSelection] = useState<Selection>(null)
  const [editMode, setEditMode] = useState(false)
  const [placing, setPlacing] = useState<'region' | 'rigging' | null>(null)
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const { flags: viewFlags, setFlag: setViewFlag } = useStageView()
  const isTabletOrLarger = useMediaQuery(SM_BREAKPOINT)

  const patchFormRef = useRef<EditPatchFormHandle>(null)
  const regionFormRef = useRef<EditStageRegionFormHandle>(null)
  const riggingFormRef = useRef<EditRiggingFormHandle>(null)

  const { data: projectData } = useProjectQuery(projectId ?? 0, { skip: projectId == null })
  const { data: patches } = usePatchListQuery(projectId ?? 0, { skip: projectId == null })
  const { data: regions } = useStageRegionListQuery(projectId ?? 0, { skip: projectId == null })
  const { data: riggings } = useRiggingListQuery(projectId ?? 0, { skip: projectId == null })

  const [updatePatch] = useUpdatePatchMutation()
  const [updateRegion] = useUpdateStageRegionMutation()
  const [updateRigging] = useUpdateRiggingMutation()
  const [createRegion] = useCreateStageRegionMutation()
  const [createRigging] = useCreateRiggingMutation()

  // 3D-mode-only affordances. Editing also requires tablet+ width.
  const showEditToggle = mode === '3d' && isTabletOrLarger
  const editingActive = mode === '3d' && editMode && isTabletOrLarger

  useEffect(() => {
    if (mode !== '3d' || !editMode) {
      setSelection(null)
      setPlacing(null)
    }
  }, [mode, editMode])

  useEffect(() => {
    if (!isTabletOrLarger && editMode) setEditMode(false)
  }, [isTabletOrLarger, editMode])

  // Escape cancels placement mode.
  useEffect(() => {
    if (!placing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlacing(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placing])

  // ⌘D / Ctrl+D duplicates the selected region or rigging, offset by 1m on X.
  // Live data is read through refs so the listener doesn't re-bind on every
  // optimistic store update (which would mean add/remove per drag frame).
  const selectionRef = useRef(selection)
  selectionRef.current = selection
  const regionsRef = useRef(regions)
  regionsRef.current = regions
  const riggingsRef = useRef(riggings)
  riggingsRef.current = riggings
  useEffect(() => {
    if (!editingActive || projectId == null) return
    const onKey = async (e: KeyboardEvent) => {
      const isDuplicateShortcut = e.key.toLowerCase() === 'd' && (e.metaKey || e.ctrlKey)
      if (!isDuplicateShortcut) return
      const sel = selectionRef.current
      if (sel?.kind !== 'region' && sel?.kind !== 'rigging') return
      // Don't hijack when the user is typing into a form field.
      if (isEditableTarget(document.activeElement)) return
      e.preventDefault()
      try {
        if (sel.kind === 'region') {
          const source = regionsRef.current?.find((r) => r.uuid === sel.uuid)
          if (!source) return
          const created = await createRegion({
            projectId,
            name: `${source.name} copy`,
            centerX: (source.centerX ?? 0) + 1,
            centerY: source.centerY,
            centerZ: source.centerZ,
            widthM: source.widthM,
            depthM: source.depthM,
            heightM: source.heightM,
            yawDeg: source.yawDeg,
          }).unwrap()
          setSelection({ kind: 'region', uuid: created.uuid })
        } else {
          const source = riggingsRef.current?.find((r) => r.uuid === sel.uuid)
          if (!source) return
          const created = await createRigging({
            projectId,
            name: `${source.name} copy`,
            kind: source.kind,
            positionX: (source.positionX ?? 0) + 1,
            positionY: source.positionY,
            positionZ: source.positionZ,
            yawDeg: source.yawDeg,
            pitchDeg: source.pitchDeg,
            rollDeg: source.rollDeg,
            lengthM: source.lengthM,
          }).unwrap()
          setSelection({ kind: 'rigging', uuid: created.uuid })
        }
      } catch (err) {
        toast.error(`Failed to duplicate: ${formatError(err)}`)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editingActive, projectId, createRegion, createRigging])

  if (projectId == null) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  // Patch key may point at a stale id during list refetches — drop the target
  // until the new row arrives so the form doesn't render against missing data.
  const panelTarget = resolvePanelTarget(selection, patches, regions, riggings)

  const showPanel = editingActive && panelTarget != null && !panelCollapsed
  const showPanelStub = editingActive && panelTarget != null && panelCollapsed

  const handleSelectionChange = (s: Selection) => {
    setSelection(s)
    if (!editingActive || s == null) return
    setPanelCollapsed(false)
  }

  const togglePlacing = (kind: 'region' | 'rigging') => {
    setPlacing((prev) => (prev === kind ? null : kind))
    setSelection(null)
  }

  // Hang truss 1m below stage top (clamped to floor for very short stages),
  // or a typical truss height if the project doesn't declare one.
  const stageH = projectData?.stageHeightM
  const trussZ = stageH != null ? Math.max(0, stageH - 1) : FALLBACK_TRUSS_HEIGHT_M

  // Match the placement-click raycast plane to the height the new object lives
  // at, so the user sees the new object exactly where they clicked.
  const placementZ = placing === 'rigging' ? trussZ : 0

  const handlePlacementClick = async (worldX: number, worldY: number) => {
    if (placing == null || projectId == null) return
    // Clear placing eagerly so a quick second click during the in-flight create
    // doesn't fire a duplicate placement.
    const kind = placing
    setPlacing(null)
    try {
      if (kind === 'region') {
        const created = await createRegion({
          projectId,
          name: nextDefaultName('Region', regions),
          centerX: worldX,
          centerY: worldY,
          centerZ: 0,
          widthM: REGION_DEFAULT_SIZE_M,
          depthM: REGION_DEFAULT_SIZE_M,
          heightM: REGION_DEFAULT_SIZE_M,
          yawDeg: 0,
        }).unwrap()
        setSelection({ kind: 'region', uuid: created.uuid })
      } else {
        const created = await createRigging({
          projectId,
          name: nextDefaultName('Rigging', riggings),
          kind: 'TRUSS',
          positionX: worldX,
          positionY: worldY,
          positionZ: trussZ,
          yawDeg: 0,
          pitchDeg: 0,
          rollDeg: 0,
          lengthM: DEFAULT_RIGGING_LENGTH_M,
        }).unwrap()
        setSelection({ kind: 'rigging', uuid: created.uuid })
      }
    } catch (err) {
      toast.error(`Failed to place: ${formatError(err)}`)
    }
  }

  // Form signalled it's done (Save/Cancel/Delete). Clear selection too, not
  // just the panel, so the highlight clears in 3D.
  const dismissPanel = () => {
    setSelection(null)
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
                variant={placing === 'region' ? 'default' : 'outline'}
                onClick={() => togglePlacing('region')}
                aria-pressed={placing === 'region'}
              >
                <Plus className="size-3.5 mr-1" />
                Region
              </Button>
              <Button
                size="sm"
                variant={placing === 'rigging' ? 'default' : 'outline'}
                onClick={() => togglePlacing('rigging')}
                aria-pressed={placing === 'rigging'}
              >
                <Plus className="size-3.5 mr-1" />
                Rigging
              </Button>
            </>
          )}
          {mode === '3d' && (
            <StageViewMenu flags={viewFlags} setFlag={setViewFlag} />
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
        <main className="flex flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 min-w-0">
            {mode === '3d' ? (
              <Stage3D
                projectId={projectId}
                editMode={editingActive}
                selection={selection}
                placing={placing}
                placementZ={placementZ}
                view={viewFlags}
                onSelectionChange={handleSelectionChange}
                onPlacementClick={handlePlacementClick}
                onPatchPlacementChange={(patch, next, settled) => {
                  patchFormRef.current?.setPlacement({
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
                  regionFormRef.current?.setPosition({
                    centerX: next.centerX,
                    centerY: next.centerY,
                    centerZ: next.centerZ,
                    yawDeg: next.yawDeg,
                    widthM: next.widthM,
                    depthM: next.depthM,
                  })
                  // Optimistic write every drag frame so the box + handles
                  // follow the cursor live. Network PUT is gated to settled.
                  store.dispatch(
                    stageRegionsApi.util.updateQueryData('stageRegionList', projectId, (draft) => {
                      const r = draft.find((x) => x.id === region.id)
                      if (!r) return
                      r.centerX = next.centerX
                      r.centerY = next.centerY
                      r.centerZ = next.centerZ
                      r.yawDeg = next.yawDeg
                      if (next.widthM !== undefined) r.widthM = next.widthM
                      if (next.depthM !== undefined) r.depthM = next.depthM
                    }),
                  )
                  if (!settled) return
                  if (
                    next.centerX === region.centerX &&
                    next.centerY === region.centerY &&
                    next.centerZ === region.centerZ &&
                    next.yawDeg === region.yawDeg &&
                    (next.widthM === undefined || next.widthM === region.widthM) &&
                    (next.depthM === undefined || next.depthM === region.depthM)
                  ) return
                  updateRegion({
                    projectId,
                    regionId: region.id,
                    centerX: next.centerX,
                    centerY: next.centerY,
                    centerZ: next.centerZ,
                    yawDeg: next.yawDeg,
                    ...(next.widthM !== undefined ? { widthM: next.widthM } : {}),
                    ...(next.depthM !== undefined ? { depthM: next.depthM } : {}),
                  }).catch(() => {})
                }}
                onRiggingPositionChange={(rig, next, settled) => {
                  riggingFormRef.current?.setPosition({
                    positionX: next.positionX,
                    positionY: next.positionY,
                    positionZ: next.positionZ,
                    yawDeg: next.yawDeg,
                    pitchDeg: next.pitchDeg,
                    rollDeg: next.rollDeg,
                    lengthM: next.lengthM,
                  })
                  // Optimistic write every drag frame so the bar + handles
                  // follow the cursor live. Network PUT is gated to settled.
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
                      if (next.lengthM !== undefined) r.lengthM = next.lengthM
                    }),
                  )
                  if (!settled) return
                  if (
                    next.positionX === rig.positionX &&
                    next.positionY === rig.positionY &&
                    next.positionZ === rig.positionZ &&
                    next.yawDeg === rig.yawDeg &&
                    next.pitchDeg === rig.pitchDeg &&
                    next.rollDeg === rig.rollDeg &&
                    (next.lengthM === undefined || next.lengthM === rig.lengthM)
                  ) return
                  updateRigging({
                    projectId,
                    riggingId: rig.id,
                    positionX: next.positionX,
                    positionY: next.positionY,
                    positionZ: next.positionZ,
                    yawDeg: next.yawDeg,
                    pitchDeg: next.pitchDeg,
                    rollDeg: next.rollDeg,
                    ...(next.lengthM !== undefined ? { lengthM: next.lengthM } : {}),
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
          </div>
          {showPanel && panelTarget && (
            <StageEditorPanel
              target={panelTarget}
              projectId={projectId}
              existingPatches={patches ?? []}
              onCollapse={() => setPanelCollapsed(true)}
              onDismiss={dismissPanel}
              patchRef={patchFormRef}
              regionRef={regionFormRef}
              riggingRef={riggingFormRef}
            />
          )}
          {showPanelStub && <StageEditorPanelStub onExpand={() => setPanelCollapsed(false)} />}
        </main>
      </div>
    </TooltipProvider>
  )
}

function resolvePanelTarget(
  selection: Selection,
  patches: FixturePatch[] | undefined,
  regions: StageRegionDto[] | undefined,
  riggings: RiggingDto[] | undefined,
): StageEditorTarget | null {
  if (selection?.kind === 'patch') {
    const p = patches?.find((x) => x.key === selection.patchKey)
    return p ? { kind: 'patch', patch: p } : null
  }
  if (selection?.kind === 'region') {
    return { kind: 'region', region: findByUuid(regions, selection.uuid) }
  }
  if (selection?.kind === 'rigging') {
    return { kind: 'rigging', rigging: findByUuid(riggings, selection.uuid) }
  }
  return null
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
