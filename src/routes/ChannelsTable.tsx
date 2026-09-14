import { useEffect, useMemo } from "react"
import { useParams, useNavigate, Navigate } from "react-router"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Lock, LockOpen } from "lucide-react"
import { useGetChannelMappingListQuery } from "../store/channelMapping"
import { useGetParkStateListQuery, useUnparkChannelMutation } from "../store/park"
import { useCurrentProjectQuery, useProjectQuery } from "../store/projects"
import { useIsDeskConnected } from "../store/status"
import { DESK_OFFLINE_LABEL } from "../api/wsGesture"
import { useGetUniverseQuery } from "../store/universes"
import { CHANNELS_VIEW_KEY, ChannelsViewSwitcher, setStoredCardsListView } from "../components/ViewSwitcher"
import { DmxSheet } from "../components/channels/DmxSheet"
import { ChannelsBreadcrumbs } from "./Channels"

/**
 * `/projects/:projectId/channels/:universe/table` — the DMX sheet, the cards route's sibling
 * (CLAUDE.md §Sheet kit). Wired exactly like `/fixtures/list`: this route writes the sticky
 * preference on mount, and the cards route redirects here when the sticky says so.
 */
export function ProjectChannelsTable() {
  const { projectId, universe } = useParams()
  const projectIdNum = Number(projectId)
  const universeNum = Number(universe ?? 0)
  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)

  // Record this as the last-used channels view even when arriving by deep link, so the sidebar's
  // "Channels" entry keeps landing here.
  useEffect(() => {
    setStoredCardsListView(CHANNELS_VIEW_KEY, 'list')
  }, [])

  if (!currentLoading && currentProject && projectIdNum !== currentProject.id) {
    return <Navigate to={`/projects/${currentProject.id}/channels/${universeNum}/table`} replace />
  }

  if (projectLoading || currentLoading) {
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

  return <ChannelsTableContent projectId={projectIdNum} projectName={project.name} universe={universeNum} />
}

function ChannelsTableContent({ projectId, projectName, universe }: { projectId: number; projectName: string; universe: number }) {
  const navigate = useNavigate()
  const connected = useIsDeskConnected()
  const { data: parkStateList } = useGetParkStateListQuery()
  const { data: mappingRecord } = useGetChannelMappingListQuery()
  const { data: universes } = useGetUniverseQuery()
  const [runUnparkChannel] = useUnparkChannelMutation()

  const parkValueMap = useMemo(() => {
    const map = new Map<number, number>()
    parkStateList?.filter((p) => p.universe === universe).forEach((p) => map.set(p.channel, p.value))
    return map
  }, [parkStateList, universe])
  const parkedCount = parkValueMap.size

  // Unpark All keeps its confirm dialog — the single most destructive park action on the page —
  // but not the cards' Edit gate: the table has no Edit mode, so the confirmation is the gate.
  const canUnpark = parkedCount > 0 && connected
  const handleUnparkAll = () => {
    if (!canUnpark) return
    if (confirm(`Unpark all ${parkedCount} channel(s) in universe ${universe}?`)) {
      parkStateList
        ?.filter((p) => p.universe === universe)
        .forEach((p) => runUnparkChannel({ universe: p.universe, channelNo: p.channel }))
    }
  }

  return (
    <Card className="m-4 p-4">
      {/* `@container`: the view switcher's labels are a container query. */}
      <div className="@container mb-4 flex items-start justify-between gap-2">
        <ChannelsBreadcrumbs projectName={projectName} />
        <div className="flex items-center gap-2">
          {parkedCount > 0 && (
            <>
              <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[10px]">
                <Lock className="size-3" />
                {parkedCount} parked
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={handleUnparkAll}
                disabled={!canUnpark}
                title={connected ? undefined : DESK_OFFLINE_LABEL}
              >
                <LockOpen className="size-3.5" />
                Unpark All
              </Button>
            </>
          )}
          <ChannelsViewSwitcher current="list" projectId={projectId} universe={universe} />
        </div>
      </div>
      {universes && universes.length > 1 && (
        <Tabs
          value={String(universe)}
          onValueChange={(v) => navigate(`/projects/${projectId}/channels/${v}/table`)}
          className="mb-4"
        >
          <TabsList>
            {universes.map((u) => (
              <TabsTrigger key={u} value={String(u)}>
                Universe {u}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      <DmxSheet
        universe={universe}
        connected={connected}
        mappings={mappingRecord?.[universe]}
        parkValueMap={parkValueMap}
      />
    </Card>
  )
}
