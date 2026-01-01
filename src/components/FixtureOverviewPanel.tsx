import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { useFixtureListQuery, type Fixture } from '../store/fixtures'
import { CompactFixtureCard, MultiElementCompactCard } from './groups/CompactFixtureCard'
import { cn } from '@/lib/utils'

interface FixtureOverviewPanelProps {
  onFixtureClick: (fixtureKey: string) => void
  isVisible: boolean
}

export function FixtureOverviewPanel({ onFixtureClick, isVisible }: FixtureOverviewPanelProps) {
  const { data: fixtures, isLoading } = useFixtureListQuery()

  // Separate fixtures into single fixtures and multi-head fixtures
  const { singleFixtures, multiHeadFixtures } = useMemo(() => {
    if (!fixtures) {
      return { singleFixtures: [], multiHeadFixtures: [] }
    }

    // Filter out element fixtures (they have .element- in their key)
    const topLevel = fixtures.filter((f) => !f.key.includes('.element-'))

    const single: Fixture[] = []
    const multiHead: Fixture[] = []

    for (const fixture of topLevel) {
      if (fixture.elements && fixture.elements.length > 0) {
        multiHead.push(fixture)
      } else {
        single.push(fixture)
      }
    }

    return { singleFixtures: single, multiHeadFixtures: multiHead }
  }, [fixtures])

  const hasFixtures = singleFixtures.length > 0 || multiHeadFixtures.length > 0

  return (
    <div
      className={cn(
        'grid transition-all duration-200 ease-in-out',
        isVisible ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      )}
    >
      <div className="overflow-hidden">
        <div className="border-b bg-background px-4 py-3">
          {isLoading ? (
            <div className="flex justify-center">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : !hasFixtures ? (
            <p className="text-sm text-muted-foreground text-center">No fixtures configured</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {/* Single fixtures */}
              {singleFixtures.map((fixture) => (
                <CompactFixtureCard
                  key={fixture.key}
                  fixtureKey={fixture.key}
                  fixtureName={fixture.name}
                  tags={[]}
                  onClick={() => onFixtureClick(fixture.key)}
                />
              ))}

              {/* Multi-head fixtures */}
              {multiHeadFixtures.map((fixture) => (
                <MultiElementCompactCard
                  key={fixture.key}
                  parentKey={fixture.key}
                  elementCount={fixture.elements!.length}
                  onClick={() => onFixtureClick(fixture.key)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
