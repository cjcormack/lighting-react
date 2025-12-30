import { Suspense, useState } from "react"
import { Card } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useGroupListQuery } from "../store/groups"
import { GroupCard } from "../components/groups/GroupCard"

export type GroupViewMode = "fixtures" | "fx"

export function Groups() {
  const [viewMode, setViewMode] = useState<GroupViewMode>("fixtures")

  return (
    <Card className="m-4 p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Groups</h1>
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as GroupViewMode)}>
          <TabsList>
            <TabsTrigger value="fixtures">Fixtures</TabsTrigger>
            <TabsTrigger value="fx">FX</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <Suspense fallback={<div>Loading...</div>}>
        <GroupsContainer viewMode={viewMode} />
      </Suspense>
    </Card>
  )
}

function GroupsContainer({ viewMode }: { viewMode: GroupViewMode }) {
  const { data: groups, isLoading } = useGroupListQuery()

  if (isLoading) {
    return <div>Loading...</div>
  }

  if (!groups || groups.length === 0) {
    return (
      <div className="text-muted-foreground text-center py-8">
        No groups configured. Groups are defined in your project configuration.
      </div>
    )
  }

  return (
    <div className={viewMode === "fx"
      ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
      : "space-y-4"
    }>
      {groups.map((group) => (
        <GroupCard key={group.name} groupSummary={group} viewMode={viewMode} />
      ))}
    </div>
  )
}

export default Groups
