import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { GroupSummary } from "../../api/groupsApi"
import { useGroupQuery } from "../../store/groups"
import { GroupFixturesMode } from "./GroupFixturesMode"
import { GroupFxMode } from "./GroupFxMode"
import { GroupViewMode } from "../../routes/Groups"

interface GroupCardProps {
  groupSummary: GroupSummary
  viewMode: GroupViewMode
}

export function GroupCard({ groupSummary, viewMode }: GroupCardProps) {
  const { data: groupDetail, isLoading } = useGroupQuery(groupSummary.name)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">{groupSummary.name}</CardTitle>
          <Badge variant="secondary" className="text-xs flex-shrink-0">
            {groupSummary.memberCount} fixture{groupSummary.memberCount !== 1 ? "s" : ""}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {groupSummary.capabilities.map((cap) => (
            <Badge key={cap} variant="outline" className="text-xs capitalize">
              {cap}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {viewMode === "fixtures" ? (
          isLoading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : groupDetail ? (
            <GroupFixturesMode group={groupDetail} />
          ) : (
            <div className="text-sm text-muted-foreground">Failed to load group</div>
          )
        ) : (
          <GroupFxMode
            groupName={groupSummary.name}
            capabilities={groupSummary.capabilities}
          />
        )}
      </CardContent>
    </Card>
  )
}
