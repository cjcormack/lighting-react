import { GroupDetail } from "../../api/groupsApi"
import { useFixtureListQuery, Fixture } from "../../store/fixtures"
import { ChannelSlider } from "../../routes/Channels"
import { Badge } from "@/components/ui/badge"

interface GroupFixturesModeProps {
  group: GroupDetail
}

export function GroupFixturesMode({ group }: GroupFixturesModeProps) {
  const { data: fixtures, isLoading } = useFixtureListQuery()

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading fixtures...</div>
  }

  if (!fixtures) {
    return <div className="text-sm text-muted-foreground">Failed to load fixtures</div>
  }

  // Create a map of fixture key to fixture data
  const fixtureMap = new Map<string, Fixture>()
  fixtures.forEach((f) => fixtureMap.set(f.key, f))

  if (group.members.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No fixtures in this group
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {group.members.map((member) => {
        const fixture = fixtureMap.get(member.fixtureKey)

        return (
          <div key={member.fixtureKey} className="border rounded-lg p-3">
            <div className="mb-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium truncate">{member.fixtureName}</span>
                <Badge variant="outline" className="text-xs ml-1 flex-shrink-0">
                  #{member.index + 1}
                </Badge>
              </div>
              {member.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {member.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            {fixture ? (
              <div className="space-y-1">
                {fixture.channels.map((channel) => (
                  <ChannelSlider
                    key={channel.channelNo}
                    universe={fixture.universe}
                    id={channel.channelNo}
                    description={channel.description}
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Fixture not found: {member.fixtureKey}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
