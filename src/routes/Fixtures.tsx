import { Suspense, useState, useMemo, useEffect, createContext, useContext } from "react"
import { useParams, useNavigate, Navigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Search, ChevronRight, Loader2, Settings2, SlidersHorizontal } from "lucide-react"
import { Fixture, useFixtureListQuery } from "../store/fixtures"
import { EditModeProvider, useEditMode } from "../components/fixtures/EditModeContext"
import { FixtureFxBadge } from "../components/fixtures/fx/FixtureFxBadge"
import { FixtureContent, FixtureViewMode } from "../components/fixtures/FixtureContent"
import { GroupDetailModal } from "../components/fixtures/GroupDetailModal"
import { useCurrentProjectQuery, useProjectQuery } from "../store/projects"

// Context for global view mode
const ViewModeContext = createContext<FixtureViewMode>('properties')
const useViewMode = () => useContext(ViewModeContext)

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

// Main ProjectFixtures route component
export function ProjectFixtures() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)

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
      <div className="mb-4">
        <Breadcrumbs projectName={project.name} />
      </div>
      <Suspense fallback={<div>Loading...</div>}>
        <FixturesContainer />
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

function FixturesContainer() {
  const { data: maybeFixtureList, isLoading } = useFixtureListQuery()
  const [filter, setFilter] = useState("")
  const [viewMode, setViewMode] = useState<FixtureViewMode>('properties')

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
    <ViewModeContext.Provider value={viewMode}>
      {/* Search and view toggle */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter fixtures by name, manufacturer, or type..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value) => value && setViewMode(value as FixtureViewMode)}
          className="shrink-0"
        >
          <ToggleGroupItem value="properties" aria-label="Show properties" title="Properties">
            <Settings2 className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="channels" aria-label="Show channels" title="Channels">
            <SlidersHorizontal className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <AllFixturesView
        fixtureList={fixtureList}
        filteredFixtures={filteredFixtures}
        filter={filter}
      />
    </ViewModeContext.Provider>
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

const FixtureCard = ({ fixture }: { fixture: Fixture }) => {
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

  return (
    <EditModeProvider>
      <Card>
        <FixtureCardHeader fixture={fixture} />
        <CardContent>
          <FixtureCardContent fixture={fixture} onGroupClick={setSelectedGroup} />
        </CardContent>
      </Card>
      <GroupDetailModal
        groupName={selectedGroup}
        onClose={() => setSelectedGroup(null)}
      />
    </EditModeProvider>
  )
}

function FixtureCardContent({
  fixture,
  onGroupClick,
}: {
  fixture: Fixture
  onGroupClick: (groupName: string) => void
}) {
  const { isEditing } = useEditMode()
  const viewMode = useViewMode()

  return (
    <FixtureContent
      fixture={fixture}
      isEditing={isEditing}
      onGroupClick={onGroupClick}
      viewMode={viewMode}
    />
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
        <FixtureFxBadge fixtureKey={fixture.key} />
      </div>
    </CardHeader>
  )
}

