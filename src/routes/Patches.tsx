import { useEffect, useMemo, useState } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Loader2, Plus, Pencil, Check } from "lucide-react"
import { useCurrentProjectQuery, useProjectQuery } from "../store/projects"
import { usePatchListQuery, useUniverseConfigListQuery, useUpdateUniverseConfigMutation, usePatchGroupListQuery } from "../store/patches"
import { useFixtureListQuery, type Fixture } from "../store/fixtures"
import { Breadcrumbs } from "@/components/Breadcrumbs"
import { AddFixtureSheet } from "@/components/patches/AddFixtureSheet"
import { EditPatchSheet } from "@/components/patches/EditPatchSheet"
import { EditGroupSheet } from "@/components/patches/EditGroupSheet"
import type { FixturePatch, UniverseConfig } from "../api/patchApi"

// ─── Redirect ─────────────────────────────────────────────────────────

export function PatchesRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/patches`, { replace: true })
    }
  }, [currentProject, isLoading, navigate])

  if (isLoading) {
    return <Card className="m-4 p-4 flex items-center justify-center"><Loader2 className="size-6 animate-spin" /></Card>
  }
  return null
}

// ─── Main route ───────────────────────────────────────────────────────

export function ProjectPatches() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const { data: project, isLoading } = useProjectQuery(projectIdNum)

  if (isLoading) {
    return <Card className="m-4 p-4 flex items-center justify-center"><Loader2 className="size-6 animate-spin" /></Card>
  }
  if (!project) {
    return <Card className="m-4 p-4"><p className="text-destructive">Project not found</p></Card>
  }

  return (
    <PatchListContent
      projectId={projectIdNum}
      projectName={project.name}
      isDbBased={project.mode === "DB_BASED"}
      isCurrent={project.isCurrent}
    />
  )
}

// ─── Content ──────────────────────────────────────────────────────────

function PatchListContent({
  projectId,
  projectName,
  isDbBased,
  isCurrent,
}: {
  projectId: number
  projectName: string
  isDbBased: boolean
  isCurrent: boolean
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [addFixtureOpen, setAddFixtureOpen] = useState(false)
  const [editingPatchId, setEditingPatchId] = useState<number | null>(null)
  const [editingGroup, setEditingGroup] = useState<{ id: number; name: string } | null>(null)

  // Open add-fixture sheet when navigated with ?action=new (e.g. from command palette)
  useEffect(() => {
    if (searchParams.get("action") === "new" && isDbBased) {
      setAddFixtureOpen(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, isDbBased, setSearchParams])

  const { data: patches, isLoading: patchesLoading } = usePatchListQuery(projectId, { skip: !isDbBased })
  const { data: fixtureList } = useFixtureListQuery(undefined, { skip: isDbBased || !isCurrent })
  const { data: universeConfigs } = useUniverseConfigListQuery(projectId, { skip: !isDbBased })
  const { data: patchGroups } = usePatchGroupListQuery(projectId, { skip: !isDbBased })

  const rows = useMemo(
    () => buildPatchRows(isDbBased ? patches : undefined, !isDbBased ? fixtureList : undefined),
    [isDbBased, patches, fixtureList],
  )

  const editingPatch = patches?.find(p => p.id === editingPatchId) ?? null

  const totalPatches = rows.length
  const totalGroups = patchGroups?.length ?? 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 space-y-4">
        <Breadcrumbs projectName={projectName} currentPage="Patch List" />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Patch List</h1>
            <p className="text-sm text-muted-foreground">
              {isDbBased
                ? `${totalPatches} fixture${totalPatches !== 1 ? 's' : ''} patched${totalGroups > 0 ? `, ${totalGroups} group${totalGroups !== 1 ? 's' : ''}` : ''}.`
                : 'Showing fixtures configured by the load-fixtures script.'}
            </p>
          </div>
          {isDbBased && (
            <Button onClick={() => setAddFixtureOpen(true)} size="sm" className="gap-1.5 shrink-0">
              <Plus className="size-4" />
              <span className="hidden sm:inline">Patch</span>
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">

        {/* Universe config chips */}
        {isDbBased && (universeConfigs?.length || patchGroups?.length) ? (
          <div className="flex flex-col gap-2 mb-4">
            {universeConfigs && universeConfigs.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Universes</span>
                {universeConfigs.map((config) => (
                  <UniverseChip key={config.id} config={config} projectId={projectId} />
                ))}
              </div>
            )}
            {patchGroups && patchGroups.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Groups</span>
                {patchGroups.map((group) => (
                  <button
                    key={group.id}
                    onClick={() => setEditingGroup({ id: group.id, name: group.name })}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs hover:bg-accent transition-colors"
                  >
                    <span className="font-medium">{group.name}</span>
                    <span className="text-muted-foreground">{group.memberCount}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {patchesLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {isDbBased
              ? "No fixtures patched yet. Click \"Add Fixture\" to get started."
              : isCurrent
                ? "No fixtures configured. Run the load-fixtures script first."
                : "Switch to this project to see the patch list."}
          </div>
        ) : (
          <PatchTable
            rows={rows}
            isDbBased={isDbBased}
            onRowClick={isDbBased ? (id) => setEditingPatchId(id) : undefined}
            onGroupClick={isDbBased ? (id, name) => setEditingGroup({ id, name }) : undefined}
          />
        )}
      </div>

      {isDbBased && (
        <>
          <AddFixtureSheet
            open={addFixtureOpen}
            onOpenChange={setAddFixtureOpen}
            projectId={projectId}
            existingPatches={patches ?? []}
          />
          <EditPatchSheet
            open={editingPatchId != null}
            onOpenChange={(open) => { if (!open) setEditingPatchId(null) }}
            patch={editingPatch}
            projectId={projectId}
            existingPatches={patches ?? []}
          />
          <EditGroupSheet
            open={editingGroup != null}
            onOpenChange={(open) => { if (!open) setEditingGroup(null) }}
            groupId={editingGroup?.id ?? null}
            groupName={editingGroup?.name ?? ''}
            projectId={projectId}
            patches={patches ?? []}
          />
        </>
      )}
    </div>
  )
}

// ─── Universe chips ───────────────────────────────────────────────────

function UniverseChip({ config, projectId }: { config: UniverseConfig; projectId: number }) {
  const [editing, setEditing] = useState(false)
  const [address, setAddress] = useState(config.address ?? '')
  const [runUpdateConfig] = useUpdateUniverseConfigMutation()

  // Sync local state when config changes from server
  useEffect(() => {
    setAddress(config.address ?? '')
  }, [config.address])

  const handleSave = () => {
    runUpdateConfig({
      projectId,
      configId: config.id,
      address: address,
    })
    setEditing(false)
  }

  return (
    <Popover open={editing} onOpenChange={setEditing}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs hover:bg-accent transition-colors">
          <span className="font-mono font-medium">U{config.universe}</span>
          {config.address ? (
            <span className="text-muted-foreground">{config.address}</span>
          ) : (
            <span className="text-muted-foreground/50 italic">no address</span>
          )}
          <Pencil className="size-2.5 text-muted-foreground/50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-2">
          <p className="text-xs font-medium">Universe {config.universe} — ArtNet Address</p>
          <div className="flex gap-2">
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
              placeholder="e.g. 192.168.1.100"
              className="text-xs h-8"
              autoFocus
            />
            <Button size="sm" className="h-8 px-2" onClick={handleSave}>
              <Check className="size-3.5" />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── Patch table ──────────────────────────────────────────────────────

interface PatchRow {
  id: number | null
  key: string
  displayName: string
  address: string
  channelCount: number
  fixtureType: string
  groups: { id: number; name: string }[]
  sortKey: number
}

function PatchTable({
  rows,
  isDbBased,
  onRowClick,
  onGroupClick,
}: {
  rows: PatchRow[]
  isDbBased: boolean
  onRowClick?: (id: number) => void
  onGroupClick?: (id: number, name: string) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[5rem]">Address</TableHead>
          <TableHead className="hidden sm:table-cell">Type</TableHead>
          <TableHead className="hidden md:table-cell">Key</TableHead>
          <TableHead>Name</TableHead>
          <TableHead className="hidden lg:table-cell">Groups</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow
            key={row.id ?? row.key}
            className={isDbBased && row.id != null ? "cursor-pointer hover:bg-accent/50" : ""}
            onClick={() => {
              if (row.id != null && onRowClick) onRowClick(row.id)
            }}
          >
            <TableCell className="font-mono text-xs tabular-nums">
              {row.address}
            </TableCell>
            <TableCell className="hidden sm:table-cell">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{row.fixtureType}</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono shrink-0">
                  {row.channelCount}ch
                </Badge>
              </div>
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <code className="text-xs text-muted-foreground">{row.key}</code>
            </TableCell>
            <TableCell>
              <div className="font-medium text-sm">{row.displayName}</div>
              {row.fixtureType && (
                <div className="sm:hidden text-[11px] text-muted-foreground flex items-center gap-1">
                  <span>{row.fixtureType}</span>
                  <span className="font-mono">{row.channelCount}ch</span>
                </div>
              )}
            </TableCell>
            <TableCell className="hidden lg:table-cell">
              <div className="flex flex-wrap gap-1">
                {row.groups.map((g) => (
                  <Badge
                    key={g.id}
                    variant="secondary"
                    className={`text-[10px] px-1.5 py-0 ${onGroupClick ? 'cursor-pointer hover:bg-accent' : ''}`}
                    onClick={(e) => {
                      if (onGroupClick) {
                        e.stopPropagation()
                        onGroupClick(g.id, g.name)
                      }
                    }}
                  >
                    {g.name}
                  </Badge>
                ))}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// ─── Address formatting ───────────────────────────────────────────────

function formatAddress(universe: number, channel: number): string {
  return `${universe}-${String(channel).padStart(3, "0")}`
}

// ─── Data transformation ──────────────────────────────────────────────

function buildPatchRows(
  patches: FixturePatch[] | undefined,
  fixtureList: Fixture[] | undefined,
): PatchRow[] {
  const rows: PatchRow[] = []

  if (patches) {
    for (const p of patches) {
      const channelCount = p.channelCount ?? 1
      rows.push({
        id: p.id,
        key: p.key,
        displayName: p.displayName,
        address: formatAddress(p.universe, p.startChannel),
        channelCount,
        fixtureType: buildTypeLabel(p.manufacturer, p.model, p.modeName),
        groups: p.groups,
        sortKey: p.universe * 1000 + p.startChannel,
      })
    }
  }

  if (fixtureList) {
    for (const f of fixtureList) {
      rows.push({
        id: null,
        key: f.key,
        displayName: f.name,
        address: formatAddress(f.universe, f.firstChannel),
        channelCount: f.channelCount,
        fixtureType: buildTypeLabel(f.manufacturer ?? null, f.model ?? null, null),
        groups: [],
        sortKey: f.universe * 1000 + f.firstChannel,
      })
    }
  }

  rows.sort((a, b) => a.sortKey - b.sortKey)
  return rows
}

function buildTypeLabel(manufacturer: string | null, model: string | null, modeName: string | null): string {
  const parts: string[] = []
  if (manufacturer) parts.push(manufacturer)
  if (model) parts.push(model)
  if (modeName) parts.push(`(${modeName})`)
  return parts.join(" ")
}
