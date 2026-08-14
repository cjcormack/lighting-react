import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Circle, Loader2 } from 'lucide-react'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { PaletteTypeSwitcher, getStoredPaletteType, setStoredPaletteType } from '../components/ViewSwitcher'
import { PaletteGrid } from '../components/palettes/PaletteGrid'
import { PaletteDetailSheet } from '../components/palettes/PaletteDetailSheet'
import { RecordPaletteSheet } from '../components/palettes/RecordPaletteSheet'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import { usePaletteListQuery } from '../store/palettes'
import { PALETTE_TYPE_LABELS, paletteTypeSlug, parsePaletteTypeSlug } from '../lib/paletteTypes'
import type { PaletteSummary } from '../api/palettesApi'

/** Bare `/palettes` → the active project's palettes. */
export function PalettesRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/palettes`, { replace: true })
    }
  }, [currentProject, isLoading, navigate])

  if (isLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }
  return null
}

/**
 * `/projects/:id/palettes` → the type you were last in.
 *
 * A route of its own rather than one of the four types owning the bare path. That is what makes
 * the redirect acyclic: the target is always a *different* route from the one redirecting, so no
 * arrangement of stored preference and link can bounce between two of them — the failure the
 * cards/list pair needs `CARDS_LINK_STATE` to break.
 */
export function PalettesTypeRedirect() {
  const { projectId } = useParams()
  return (
    <Navigate
      to={`/projects/${projectId}/palettes/${paletteTypeSlug(getStoredPaletteType())}`}
      replace
    />
  )
}

/** One type's bank of palettes. */
export function ProjectPalettes() {
  const { projectId, type: typeSlug } = useParams()
  const projectIdNum = Number(projectId)
  const type = parsePaletteTypeSlug(typeSlug)
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)
  const { data: palettes, isLoading: palettesLoading } = usePaletteListQuery(
    { projectId: projectIdNum, type: type ?? undefined },
    { skip: type == null },
  )

  const [openPalette, setOpenPalette] = useState<PaletteSummary | null>(null)
  const [recordOpen, setRecordOpen] = useState(false)
  const [rerecordPalette, setRerecordPalette] = useState<PaletteSummary | null>(null)

  // Remember the type for the bare-path redirect. In an effect rather than at render: the
  // switcher already records the choice on click, and this covers arriving by deep link or by
  // Cmd+K, where nothing was clicked.
  useEffect(() => {
    if (type) setStoredPaletteType(type)
  }, [type])

  // A hand-edited or stale slug lands somewhere rather than rendering blank.
  if (typeSlug !== undefined && type == null) {
    return <Navigate to={`/projects/${projectId}/palettes`} replace />
  }

  if (projectLoading || type == null) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  if (!project) {
    return (
      <Card className="m-4 p-4">
        <p className="text-destructive">Project not found</p>
      </Card>
    )
  }

  return (
    <Card className="m-4 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Breadcrumbs projectName={project.name} currentPage="Palettes" />
        <div className="flex items-center gap-2">
          <PaletteTypeSwitcher current={type} projectId={projectIdNum} />
          <Button size="sm" onClick={() => setRecordOpen(true)}>
            <Circle className="size-3.5" />
            Record palette
          </Button>
        </div>
      </div>

      {palettesLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : (
        <PaletteGrid
          palettes={palettes ?? []}
          onOpen={setOpenPalette}
          emptyHint={`Set ${PALETTE_TYPE_LABELS[type].singular.toLowerCase()} values on the fixtures you want in the programmer, then Record palette.`}
        />
      )}

      <PaletteDetailSheet
        open={openPalette != null}
        onOpenChange={(next) => !next && setOpenPalette(null)}
        projectId={projectIdNum}
        palette={openPalette}
        onRerecord={(palette) => {
          setOpenPalette(null)
          setRerecordPalette(palette)
        }}
      />

      {/* Two mount points for one sheet would double its state, so re-record reuses this one
          and just seeds a target palette. */}
      <RecordPaletteSheet
        open={recordOpen || rerecordPalette != null}
        onOpenChange={(next) => {
          if (!next) {
            setRecordOpen(false)
            setRerecordPalette(null)
          }
        }}
        projectId={projectIdNum}
        defaultType={rerecordPalette?.type ?? type}
        targetPaletteId={rerecordPalette?.id}
      />
    </Card>
  )
}
