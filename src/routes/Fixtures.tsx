import { Suspense, useState, useMemo, useEffect } from "react"
import { useSearchParams, useParams, useNavigate, Navigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Search, ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import { Fixture, ElementDescriptor, useFixtureListQuery } from "../store/fixtures"
import { PropertyVisualizer } from "../components/fixtures/PropertyVisualizers"
import { EditModeProvider, useEditMode } from "../components/fixtures/EditModeContext"
import { useGetChannelQuery, useUpdateChannelMutation } from "../store/channels"
import { useGroupListQuery, useGroupQuery } from "../store/groups"
import { GroupSummary } from "../api/groupsApi"
import { useCurrentProjectQuery, useProjectQuery } from "../store/projects"
import { cn } from "@/lib/utils"

// Redirect component for /fixtures route
export function FixturesRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/fixtures`, { replace: true })
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

type ViewMode = "all" | "byGroup"

// Main ProjectFixtures route component
export function ProjectFixtures() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)
  const [searchParams, setSearchParams] = useSearchParams()

  const viewMode: ViewMode = searchParams.get("view") === "byGroup" ? "byGroup" : "all"

  const setViewMode = (mode: ViewMode) => {
    const newParams = new URLSearchParams(searchParams)
    if (mode === "all") {
      newParams.delete("view")
    } else {
      newParams.set("view", mode)
    }
    setSearchParams(newParams)
  }

  // If viewing a non-current project, redirect to the current project
  if (!currentLoading && currentProject && projectIdNum !== currentProject.id) {
    return <Navigate to={`/projects/${currentProject.id}/fixtures`} replace />
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

  return (
    <Card className="m-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <Breadcrumbs projectName={project.name} />
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)} className="self-start sm:self-auto">
          <TabsList>
            <TabsTrigger value="all">All Fixtures</TabsTrigger>
            <TabsTrigger value="byGroup">By Group</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <Suspense fallback={<div>Loading...</div>}>
        <FixturesContainer viewMode={viewMode} />
      </Suspense>
    </Card>
  )
}

// Breadcrumbs component
function Breadcrumbs({ projectName }: { projectName: string }) {
  const navigate = useNavigate()

  return (
    <nav className="flex items-center gap-1 text-sm flex-wrap">
      <button
        onClick={() => navigate("/projects")}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        Projects
      </button>
      <ChevronRight className="size-4 text-muted-foreground flex-shrink-0" />
      <button
        onClick={() => navigate("/projects")}
        className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
      >
        {projectName}
        <Badge variant="default" className="text-xs">
          active
        </Badge>
      </button>
      <ChevronRight className="size-4 text-muted-foreground flex-shrink-0" />
      <span className="font-medium">Fixtures</span>
    </nav>
  )
}

function FixturesContainer({ viewMode }: { viewMode: ViewMode }) {
  const { data: maybeFixtureList, isLoading } = useFixtureListQuery()
  const [filter, setFilter] = useState("")

  const fixtureList = maybeFixtureList || []

  const filteredFixtures = useMemo(() => {
    if (!filter.trim()) return fixtureList

    const searchTerms = filter.toLowerCase().split(/\s+/)
    return fixtureList.filter((fixture) => {
      const searchableText = [
        fixture.name,
        fixture.manufacturer,
        fixture.model,
        fixture.typeKey,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return searchTerms.every((term) => searchableText.includes(term))
    })
  }, [fixtureList, filter])

  if (isLoading) {
    return <div>Loading...</div>
  }

  return (
    <>
      {/* Search input */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Filter fixtures by name, manufacturer, or type..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Content based on view mode */}
      {viewMode === "all" ? (
        <AllFixturesView
          fixtureList={fixtureList}
          filteredFixtures={filteredFixtures}
          filter={filter}
        />
      ) : (
        <ByGroupView fixtureList={fixtureList} filter={filter} />
      )}
    </>
  )
}

function AllFixturesView({
  fixtureList,
  filteredFixtures,
  filter,
}: {
  fixtureList: Fixture[]
  filteredFixtures: Fixture[]
  filter: string
}) {
  if (filteredFixtures.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-8">
        {fixtureList.length === 0
          ? "No fixtures available"
          : "No fixtures match your filter"}
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {filteredFixtures.map((fixture) => (
        <FixtureCard fixture={fixture} key={fixture.key} />
      ))}
    </div>
  )
}

function ByGroupView({
  fixtureList,
  filter,
}: {
  fixtureList: Fixture[]
  filter: string
}) {
  const { data: groups, isLoading: groupsLoading } = useGroupListQuery()

  // Create fixture map for quick lookup
  const fixtureMap = useMemo(() => {
    const map = new Map<string, Fixture>()
    fixtureList.forEach((f) => map.set(f.key, f))
    return map
  }, [fixtureList])

  if (groupsLoading) {
    return <div>Loading groups...</div>
  }

  if (!groups || groups.length === 0) {
    return (
      <div className="text-muted-foreground text-center py-8">
        No groups configured. Switch to "All Fixtures" view to see fixtures.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <GroupSection
          key={group.name}
          groupSummary={group}
          filter={filter}
          fixtureMap={fixtureMap}
        />
      ))}
      <UngroupedSection
        fixtureList={fixtureList}
        groups={groups}
        filter={filter}
        fixtureMap={fixtureMap}
      />
    </div>
  )
}

function GroupSection({
  groupSummary,
  filter,
  fixtureMap,
}: {
  groupSummary: GroupSummary
  filter: string
  fixtureMap: Map<string, Fixture>
}) {
  const [expanded, setExpanded] = useState(true)
  const { data: groupDetail, isLoading } = useGroupQuery(groupSummary.name)

  // Filter fixtures in this group based on search
  const filteredMembers = useMemo(() => {
    if (!groupDetail) return []
    if (!filter.trim()) return groupDetail.members

    const searchTerms = filter.toLowerCase().split(/\s+/)
    return groupDetail.members.filter((member) => {
      const fixture = fixtureMap.get(member.fixtureKey)
      if (!fixture) return false

      const searchableText = [
        fixture.name,
        fixture.manufacturer,
        fixture.model,
        fixture.typeKey,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return searchTerms.every((term) => searchableText.includes(term))
    })
  }, [groupDetail, filter, fixtureMap])

  // Hide section if no fixtures match filter
  if (filter && filteredMembers.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader
        className="cursor-pointer pb-2"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="size-4 shrink-0" />
          ) : (
            <ChevronRight className="size-4 shrink-0" />
          )}
          <CardTitle className="text-lg">{groupSummary.name}</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {filteredMembers.length} fixture
            {filteredMembers.length !== 1 ? "s" : ""}
            {filter &&
              groupDetail &&
              filteredMembers.length !== groupDetail.members.length &&
              ` of ${groupDetail.members.length}`}
          </Badge>
          <div className="flex flex-wrap gap-1 ml-auto">
            {groupSummary.capabilities.map((cap) => (
              <Badge key={cap} variant="outline" className="text-xs capitalize">
                {cap}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          {isLoading ? (
            <div>Loading fixtures...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredMembers.map((member) => {
                const fixture = fixtureMap.get(member.fixtureKey)
                if (!fixture) return null
                return <FixtureCard fixture={fixture} key={fixture.key} />
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function UngroupedSection({
  fixtureList,
  groups,
  filter,
  fixtureMap,
}: {
  fixtureList: Fixture[]
  groups: GroupSummary[]
  filter: string
  fixtureMap: Map<string, Fixture>
}) {
  const [expanded, setExpanded] = useState(true)

  // Fetch all group details to find grouped fixture keys
  // We need to collect all grouped fixture keys from all groups
  const groupQueries = groups.map((g) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useGroupQuery(g.name)
  })

  const allLoading = groupQueries.some((q) => q.isLoading)

  const groupedFixtureKeys = useMemo(() => {
    const keys = new Set<string>()
    groupQueries.forEach((q) => {
      q.data?.members.forEach((m) => keys.add(m.fixtureKey))
    })
    return keys
  }, [groupQueries])

  const ungroupedFixtures = useMemo(() => {
    let fixtures = fixtureList.filter((f) => !groupedFixtureKeys.has(f.key))

    if (filter.trim()) {
      const searchTerms = filter.toLowerCase().split(/\s+/)
      fixtures = fixtures.filter((fixture) => {
        const searchableText = [
          fixture.name,
          fixture.manufacturer,
          fixture.model,
          fixture.typeKey,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return searchTerms.every((term) => searchableText.includes(term))
      })
    }

    return fixtures
  }, [fixtureList, groupedFixtureKeys, filter])

  if (allLoading) return null
  if (ungroupedFixtures.length === 0) return null

  return (
    <Card>
      <CardHeader
        className="cursor-pointer pb-2"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="size-4 shrink-0" />
          ) : (
            <ChevronRight className="size-4 shrink-0" />
          )}
          <CardTitle className="text-lg text-muted-foreground">
            Ungrouped
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {ungroupedFixtures.length} fixture
            {ungroupedFixtures.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {ungroupedFixtures.map((fixture) => (
              <FixtureCard fixture={fixture} key={fixture.key} />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

/**
 * Determine card span based on element count
 * Only multi-head fixtures get wider cards
 */
function getCardSpan(fixture: Fixture): number {
  const elementCount = fixture.elements?.length ?? 0

  // Only multi-element fixtures get wider cards
  if (elementCount >= 4) return 4
  if (elementCount >= 3) return 3
  if (elementCount >= 2) return 2

  return 1
}

const FixtureCard = ({ fixture }: { fixture: Fixture }) => {
  const [tab, setTab] = useState("properties")
  const hasElements = (fixture.elements?.length ?? 0) > 0
  const span = getCardSpan(fixture)

  return (
    <EditModeProvider>
      <Card
        className={cn(
          span === 2 && "md:col-span-2",
          span === 3 && "md:col-span-2 lg:col-span-3",
          span === 4 && "md:col-span-2 lg:col-span-3 xl:col-span-4"
        )}
      >
        <FixtureCardHeader fixture={fixture} />
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="properties">Properties</TabsTrigger>
              <TabsTrigger value="channels">Channels</TabsTrigger>
            </TabsList>

            <TabsContent value="properties" className="pt-2">
              <PropertiesView fixture={fixture} hasElements={hasElements} />
            </TabsContent>

            <TabsContent value="channels" className="pt-2">
              <ChannelsView fixture={fixture} span={span} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </EditModeProvider>
  )
}

function FixtureCardHeader({ fixture }: { fixture: Fixture }) {
  const { isEditing, toggleEditing } = useEditMode()
  const hasElements = (fixture.elements?.length ?? 0) > 0

  return (
    <CardHeader className="pb-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <CardTitle className="text-lg truncate">{fixture.name}</CardTitle>
          {(fixture.manufacturer || fixture.model) && (
            <p className="text-xs text-muted-foreground truncate">
              {[fixture.manufacturer, fixture.model].filter(Boolean).join(" ")}
            </p>
          )}
        </div>
        <Button
          variant={isEditing ? "default" : "outline"}
          size="sm"
          onClick={toggleEditing}
          className="shrink-0"
        >
          {isEditing ? "Done" : "Edit"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1 mt-1">
        {hasElements && (
          <Badge variant="secondary" className="text-xs">
            {fixture.elements!.length} heads
          </Badge>
        )}
        {fixture.mode && (
          <Badge variant="outline" className="text-xs">
            {fixture.mode.modeName}
          </Badge>
        )}
        {fixture.capabilities?.map((cap) => (
          <Badge key={cap} variant="outline" className="text-xs capitalize">
            {cap}
          </Badge>
        ))}
      </div>
    </CardHeader>
  )
}

function PropertiesView({
  fixture,
  hasElements,
}: {
  fixture: Fixture
  hasElements: boolean
}) {
  const { isEditing } = useEditMode()

  // Group properties by category for better organization
  const colourProps =
    fixture.properties?.filter((p) => p.type === "colour") ?? []
  const positionProps =
    fixture.properties?.filter((p) => p.type === "position") ?? []
  const dimmerProps =
    fixture.properties?.filter(
      (p) => p.type === "slider" && p.category === "dimmer"
    ) ?? []
  const otherSliders =
    fixture.properties?.filter(
      (p) => p.type === "slider" && p.category !== "dimmer"
    ) ?? []
  const settingProps =
    fixture.properties?.filter((p) => p.type === "setting") ?? []

  const hasFixtureProperties =
    fixture.properties && fixture.properties.length > 0

  return (
    <div className="space-y-4">
      {/* Fixture-level properties - constrained width for multi-head fixtures */}
      {hasFixtureProperties && (
        <div className={cn("space-y-1", hasElements && "max-w-sm")}>
          {/* Colour properties first (most visually prominent) */}
          {colourProps.map((prop) => (
            <PropertyVisualizer
              key={prop.name}
              property={prop}
              isEditing={isEditing}
            />
          ))}

          {/* Position properties */}
          {positionProps.map((prop) => (
            <PropertyVisualizer
              key={prop.name}
              property={prop}
              isEditing={isEditing}
            />
          ))}

          {/* Dimmer properties */}
          {dimmerProps.map((prop) => (
            <PropertyVisualizer
              key={prop.name}
              property={prop}
              isEditing={isEditing}
            />
          ))}

          {/* Other slider properties */}
          {otherSliders.map((prop) => (
            <PropertyVisualizer
              key={prop.name}
              property={prop}
              isEditing={isEditing}
            />
          ))}

          {/* Setting properties */}
          {settingProps.map((prop) => (
            <PropertyVisualizer
              key={prop.name}
              property={prop}
              isEditing={isEditing}
            />
          ))}
        </div>
      )}

      {/* Per-head properties */}
      {hasElements && fixture.elements && (
        <>
          {hasFixtureProperties && (
            <div className="border-t pt-3">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Heads
              </h4>
            </div>
          )}
          <ElementsView elements={fixture.elements} />
        </>
      )}

      {!hasFixtureProperties && !hasElements && (
        <p className="text-sm text-muted-foreground">No properties available</p>
      )}
    </div>
  )
}

function ElementsView({ elements }: { elements: ElementDescriptor[] }) {
  const { isEditing } = useEditMode()

  return (
    <div
      className={cn(
        "grid gap-4",
        // Responsive grid: single column on mobile, then expand based on head count
        "grid-cols-1",
        elements.length >= 2 && "sm:grid-cols-2",
        elements.length >= 3 && "lg:grid-cols-3",
        elements.length >= 4 && "xl:grid-cols-4"
      )}
    >
      {elements.map((element) => (
        <div key={element.key} className="border rounded p-3 min-w-0">
          <h4 className="font-medium text-sm mb-2">{element.displayName}</h4>
          <div className="space-y-1">
            {element.properties.map((prop) => (
              <PropertyVisualizer
                key={prop.name}
                property={prop}
                isEditing={isEditing}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ChannelsView({ fixture, span }: { fixture: Fixture; span: number }) {
  const { isEditing } = useEditMode()

  // Max columns based on card span
  const maxColumns = Math.min(span, 3)

  // Split channels into columns for vertical ordering
  const channelCount = fixture.channels.length
  const rowsPerColumn = Math.ceil(channelCount / maxColumns)

  const columns: typeof fixture.channels[] = []
  for (let i = 0; i < maxColumns; i++) {
    columns.push(fixture.channels.slice(i * rowsPerColumn, (i + 1) * rowsPerColumn))
  }

  return (
    <div
      className={cn(
        "grid gap-x-4",
        "grid-cols-1",
        maxColumns >= 2 && "md:grid-cols-2",
        maxColumns >= 3 && "xl:grid-cols-3",
      )}
    >
      {columns.map((columnChannels, colIndex) => (
        <div key={colIndex} className="min-w-0">
          {columnChannels.map((channel) => (
            <ChannelSlider
              key={channel.channelNo}
              universe={fixture.universe}
              id={channel.channelNo}
              description={channel.description}
              isEditing={isEditing}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function ChannelSlider({
  universe,
  id,
  description,
  isEditing,
}: {
  universe: number
  id: number
  description?: string
  isEditing: boolean
}) {
  const { data: maybeValue } = useGetChannelQuery({
    universe: universe,
    channelNo: id,
  })

  const value = maybeValue || 0
  const percentage = Math.round((value / 255) * 100)

  const [runUpdateChannelMutation] = useUpdateChannelMutation()

  const setValue = (value: number) => {
    runUpdateChannelMutation({
      universe: universe,
      channelNo: id,
      value: value,
    })
  }

  const handleSliderChange = (values: number[]) => {
    if (values[0] !== undefined) {
      setValue(values[0])
    }
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.value === "") {
      setValue(0)
      return
    }

    const valueNumber = Number(event.target.value)
    if (isNaN(valueNumber)) {
      return
    } else if (valueNumber < 0) {
      setValue(0)
    } else if (valueNumber > 255) {
      setValue(255)
    } else {
      setValue(valueNumber)
    }
  }

  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium w-6 shrink-0 text-muted-foreground">
          {id}
        </span>
        <span
          className="text-xs truncate w-16 sm:w-28 min-w-0"
          title={description}
        >
          {description || `Ch ${id}`}
        </span>
        {isEditing ? (
          <>
            <Slider
              className="flex-1 min-w-12 shrink-0"
              value={[value]}
              max={255}
              step={1}
              onValueChange={handleSliderChange}
            />
            <Input
              type="number"
              value={value}
              onChange={handleInputChange}
              min={0}
              max={255}
              className="w-12 sm:w-14 h-7 text-xs px-1 shrink-0"
            />
          </>
        ) : (
          <>
            <div className="flex-1 min-w-12 shrink-0 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="w-8 sm:w-10 text-xs text-right text-muted-foreground shrink-0">
              {value}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
