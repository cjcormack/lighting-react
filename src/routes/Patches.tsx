import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Columns3, Layers, Loader2, Plus, Pencil, Check, Search } from "lucide-react"
import { usePatchListQuery, useUniverseConfigListQuery, useUpdateUniverseConfigMutation, usePatchGroupListQuery } from "../store/patches"
import { useRiggingListQuery } from "../store/riggings"
import { useFixtureTypeListQuery } from "../store/fixtures"
import { usePersistentState } from "../hooks/usePersistentState"
import { AddFixtureSheet } from "@/components/patches/AddFixtureSheet"
import { EditPatchSheet } from "@/components/patches/EditPatchSheet"
import { EditGroupSheet } from "@/components/patches/EditGroupSheet"
import {
  PATCH_COLUMN_LABELS,
  PATCH_COLUMN_ORDER,
  PatchSheet,
  patchRowId,
  type PatchColumnKey,
  type PatchSheetRow,
} from "@/components/patches/PatchSheet"
import { universeFill } from "@/lib/patchAddress"
import type { FixturePatch, UniverseConfig } from "../api/patchApi"
import {
  DEFAULT_REFRESH_INTERVAL_MS,
  MAX_REFRESH_INTERVAL_MS,
  MIN_REFRESH_INTERVAL_MS,
} from "../api/patchApi"
import { parseNullableNumber } from "@/lib/utils"
import { CurrentProjectRedirect } from "@/components/CurrentProjectRedirect"

// ─── Redirect ─────────────────────────────────────────────────────────

export function PatchesRedirect() {
  return <CurrentProjectRedirect to="settings/patches" />
}

// ─── Content ──────────────────────────────────────────────────────────

const DEFAULT_COLUMNS: Record<PatchColumnKey, boolean> = {
  address: true,
  type: true,
  mode: true,
  ch: true,
  key: true,
  mount: true,
  angle: true,
  gel: true,
  groups: true,
  stage: true,
}

/**
 * The Patch List tab — the patch list as a sheet (CLAUDE.md §Sheet kit), under row B: a universe
 * toggle, the filter, then Groups, Columns and `+ Patch` on the row. It stays a settings tab; the
 * universe chips above it carry a fill bar now, and the group chips fold behind the Groups button.
 */
export function PatchListContent({
  projectId,
}: {
  projectId: number
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [addFixtureOpen, setAddFixtureOpen] = useState(false)
  const [editingPatchId, setEditingPatchId] = useState<number | null>(null)
  const [editingGroup, setEditingGroup] = useState<{ id: number; name: string } | null>(null)
  const [universeFilter, setUniverseFilter] = useState<'all' | number>('all')
  const [filter, setFilter] = useState('')
  const [showGroups, setShowGroups] = usePersistentState('patches.showGroups', true)
  const [columnVisibility, setColumnVisibility] = usePersistentState<Record<PatchColumnKey, boolean>>(
    'patches.columns',
    DEFAULT_COLUMNS,
    { merge: true },
  )
  const [selectedCount, setSelectedCount] = useState(0)

  // Open add-fixture sheet when navigated with ?action=new (e.g. from command palette)
  useEffect(() => {
    if (searchParams.get("action") === "new") {
      setAddFixtureOpen(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const { data: patches, isLoading: patchesLoading } = usePatchListQuery(projectId)
  const { data: universeConfigs } = useUniverseConfigListQuery(projectId)
  const { data: patchGroups } = usePatchGroupListQuery(projectId)
  const { data: riggings } = useRiggingListQuery(projectId)
  const { data: fixtureTypes } = useFixtureTypeListQuery()

  const universes = useMemo(
    () => [...new Set((patches ?? []).map((p) => p.universe))].sort((a, b) => a - b),
    [patches],
  )
  const rows = useMemo(
    () => buildPatchRows(patches, riggings, fixtureTypes, universeFilter, filter),
    [patches, riggings, fixtureTypes, universeFilter, filter],
  )
  const visibleColumns = useMemo(
    () => PATCH_COLUMN_ORDER.filter((key) => columnVisibility[key]),
    [columnVisibility],
  )
  const onEditPatch = useCallback((id: number) => setEditingPatchId(id), [])
  const onEditGroup = useCallback((id: number, name: string) => setEditingGroup({ id, name }), [])

  const editingPatch = patches?.find(p => p.id === editingPatchId) ?? null
  const totalPatches = patches?.length ?? 0
  const totalGroups = patchGroups?.length ?? 0
  const heads = useMemo(
    () => (patches ?? []).map((p) => ({ id: p.id, name: p.displayName, universe: p.universe, channel: p.startChannel, footprint: p.channelCount ?? 1 })),
    [patches],
  )
  const addressesUsed = useMemo(
    () => universes.reduce((n, u) => n + universeFill(heads, u), 0),
    [heads, universes],
  )

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Universe chips, with a fill bar each; the group chips fold behind row B's Groups. */}
      {(universeConfigs?.length || (showGroups && patchGroups?.length)) ? (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-1 pt-3">
          {universeConfigs && universeConfigs.length > 0 && (
            <>
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Universes</span>
              {universeConfigs.map((config) => (
                <UniverseChip
                  key={config.id}
                  config={config}
                  projectId={projectId}
                  fill={universeFill(heads, config.universe)}
                />
              ))}
            </>
          )}
          {showGroups && patchGroups && patchGroups.length > 0 && (
            <>
              <span className="w-3" />
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
            </>
          )}
        </div>
      ) : null}

      {/* Row B: universe toggle · filter · spacer · Groups · Columns · + Patch. 40px, 32px controls. */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        {universes.length > 1 && (
          <ToggleGroup
            type="single"
            size="sm"
            value={universeFilter === 'all' ? 'all' : String(universeFilter)}
            onValueChange={(v) => {
              if (!v) return
              setUniverseFilter(v === 'all' ? 'all' : Number(v))
            }}
            aria-label="Universe"
          >
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            {universes.map((u) => (
              <ToggleGroupItem key={u} value={String(u)}>
                U{u}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        <div className="relative min-w-0 max-w-[340px] flex-[999_1_0%]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter…"
            title="Filter by name, key, type or address"
            aria-label="Filter by name, key, type or address"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8 pl-9"
          />
        </div>
        <div className="flex-1" />
        <Button
          variant={showGroups ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowGroups(!showGroups)}
          title="Show the group chips"
          aria-pressed={showGroups}
        >
          <Layers className="size-3.5" />
          <span className="hidden sm:inline">Groups</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" title="Choose columns">
              <Columns3 className="size-3.5" />
              <span className="hidden sm:inline">Columns</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {PATCH_COLUMN_ORDER.map((key) => (
              <DropdownMenuCheckboxItem
                key={key}
                checked={columnVisibility[key]}
                onCheckedChange={(checked) =>
                  setColumnVisibility({ ...columnVisibility, [key]: checked === true })
                }
              >
                {PATCH_COLUMN_LABELS[key]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button onClick={() => setAddFixtureOpen(true)} size="sm" className="gap-1.5 shrink-0">
          <Plus className="size-4" />
          <span className="hidden sm:inline">Patch</span>
        </Button>
      </div>

      {patchesLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin" /></div>
      ) : totalPatches === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No fixtures patched yet. Click &ldquo;Patch&rdquo; to get started.
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No fixtures match your filter.</div>
      ) : (
        <PatchSheet
          projectId={projectId}
          rows={rows}
          allPatches={patches ?? []}
          riggings={riggings ?? []}
          visibleColumns={visibleColumns}
          onEditPatch={onEditPatch}
          onEditGroup={onEditGroup}
          onCountsChange={setSelectedCount}
        />
      )}

      {/* The footer: the counts, and how full the rig is. */}
      <div className="flex h-[22px] shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap border-t px-3 text-[10.5px] text-muted-foreground">
        <span className="tabular-nums">
          {totalPatches} fixture{totalPatches === 1 ? '' : 's'} patched
          {selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
          {totalGroups > 0 ? ` · ${totalGroups} group${totalGroups === 1 ? '' : 's'}` : ''}
        </span>
        <span className="ml-auto tabular-nums">
          {universes.length} universe{universes.length === 1 ? '' : 's'} · {addressesUsed} of {universes.length * 512} addresses
        </span>
      </div>

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
    </div>
  )
}

// ─── Universe chips ───────────────────────────────────────────────────

function UniverseChip({ config, projectId, fill }: { config: UniverseConfig; projectId: number; fill: number }) {
  const [editing, setEditing] = useState(false)
  const [address, setAddress] = useState(config.address ?? '')
  const [intervalMs, setIntervalMs] = useState(String(config.refreshIntervalMs))
  const [error, setError] = useState<string | null>(null)
  const [runUpdateConfig, { isLoading: isSaving }] = useUpdateUniverseConfigMutation()

  // Sync local state when config changes from server
  useEffect(() => {
    setAddress(config.address ?? '')
  }, [config.address])

  useEffect(() => {
    setIntervalMs(String(config.refreshIntervalMs))
  }, [config.refreshIntervalMs])

  // A failed save leaves the popover open showing why. Without this, dismissing it and
  // reopening re-renders that stale error against fields that no longer match it.
  useEffect(() => {
    if (!editing) setError(null)
  }, [editing])

  const parsedInterval = parseNullableNumber(intervalMs)
  const intervalValid =
    parsedInterval !== null &&
    Number.isInteger(parsedInterval) &&
    parsedInterval >= MIN_REFRESH_INTERVAL_MS &&
    parsedInterval <= MAX_REFRESH_INTERVAL_MS

  const save = async (body: { address?: string; refreshIntervalMs?: number; resetRefreshInterval?: boolean }) => {
    setError(null)
    try {
      await runUpdateConfig({ projectId, configId: config.id, ...body }).unwrap()
      setEditing(false)
    } catch (e) {
      // A 400 is reachable now that the interval is bounded, so the popover has to be able
      // to say why rather than silently discarding the edit.
      const detail = (e as { data?: { error?: string } })?.data?.error
      setError(detail ?? 'Could not save universe settings.')
    }
  }

  const handleSave = () => {
    if (!intervalValid) return
    void save({ address, refreshIntervalMs: parsedInterval })
  }

  const handleUseDefault = () => void save({ address, resetRefreshInterval: true })

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
          {/* The fill bar: how many of the universe's 512 addresses its heads occupy. Titan draws
              one per line; here it is the one thing about a universe an operator patching by
              hand wants to see at a glance. */}
          <span
            className="relative h-1.5 w-16 overflow-hidden rounded-full bg-muted"
            title={`${fill} of 512 addresses used`}
            role="img"
            aria-label={`${fill} of 512 addresses used`}
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/70"
              style={{ width: `${Math.round((fill / 512) * 100)}%` }}
            />
          </span>
          {/* Only when pinned on this desk. A machine-local setting that lives behind a
              popover is one people forget they set — but showing the default on every
              chip would be noise on every rig that never touches it. */}
          {config.refreshIntervalOverridden && (
            <span className="text-muted-foreground font-mono">· {config.refreshIntervalMs}ms</span>
          )}
          <Pencil className="size-2.5 text-muted-foreground/50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="space-y-3">
          <p className="text-xs font-medium">Universe {config.universe}</p>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor={`u${config.id}-address`}>
              ArtNet address
            </label>
            <Input
              id={`u${config.id}-address`}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
              placeholder="e.g. 192.168.1.100"
              className="text-xs h-8"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor={`u${config.id}-interval`}>
              Refresh interval (ms)
            </label>
            <div className="flex gap-2">
              <Input
                id={`u${config.id}-interval`}
                type="number"
                min={MIN_REFRESH_INTERVAL_MS}
                max={MAX_REFRESH_INTERVAL_MS}
                step={1}
                value={intervalMs}
                onChange={(e) => setIntervalMs(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
                onFocus={(e) => e.target.select()}
                className="text-xs h-8"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2 text-xs whitespace-nowrap"
                disabled={isSaving || !config.refreshIntervalOverridden}
                onClick={handleUseDefault}
              >
                Use default
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {config.refreshIntervalOverridden
                ? `Set on this desk. Default is ${DEFAULT_REFRESH_INTERVAL_MS}ms.`
                : `Using the ${DEFAULT_REFRESH_INTERVAL_MS}ms default.`}{' '}
              This machine only — it does not travel with the show.
            </p>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end">
            <Button size="sm" className="h-8 px-3" disabled={isSaving || !intervalValid} onClick={handleSave}>
              <Check className="size-3.5 mr-1" /> Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── Data transformation ──────────────────────────────────────────────

function buildPatchRows(
  patches: FixturePatch[] | undefined,
  riggings: { uuid: string; name: string }[] | undefined,
  fixtureTypes: { typeKey: string; acceptsBeamAngle?: boolean; acceptsGel?: boolean }[] | undefined,
  universeFilter: 'all' | number,
  filter: string,
): PatchSheetRow[] {
  if (!patches) return []

  const riggingNames = new Map<string, string>()
  for (const r of riggings ?? []) riggingNames.set(r.uuid, r.name)
  const typeByKey = new Map((fixtureTypes ?? []).map((t) => [t.typeKey, t]))
  const needle = filter.trim().toLowerCase()

  const rows: PatchSheetRow[] = patches
    .filter((p) => universeFilter === 'all' || p.universe === universeFilter)
    .filter((p) => {
      if (needle === '') return true
      const address = `${p.universe}-${String(p.startChannel).padStart(3, '0')}`
      return [p.displayName, p.key, p.manufacturer, p.model, p.modeName, address]
        .some((field) => field?.toLowerCase().includes(needle))
    })
    .map((p) => {
      const type = typeByKey.get(p.fixtureTypeKey)
      return {
        id: patchRowId(p.id),
        patch: p,
        riggingName: p.riggingUuid ? riggingNames.get(p.riggingUuid) ?? null : null,
        acceptsBeamAngle: type?.acceptsBeamAngle ?? false,
        acceptsGel: type?.acceptsGel ?? false,
      }
    })

  rows.sort((a, b) => a.patch.universe * 1000 + a.patch.startChannel - (b.patch.universe * 1000 + b.patch.startChannel))
  return rows
}
