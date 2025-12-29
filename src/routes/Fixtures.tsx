import { Suspense, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChannelSlider } from "./Channels"
import { Fixture, useFixtureListQuery } from "../store/fixtures"

export function Fixtures() {
  return (
    <Card className="m-4 p-4">
      <h1 className="text-3xl font-bold mb-6">Fixtures</h1>
      <Suspense fallback={<div>Loading...</div>}>
        <FixturesContainer />
      </Suspense>
    </Card>
  )
}

function FixturesContainer() {
  const { data: maybeFixtureList, isLoading } = useFixtureListQuery()

  const fixtureList = maybeFixtureList || []

  if (isLoading) {
    return <div>Loading...</div>
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {fixtureList.map(fixture => (
        <FixtureCard fixture={fixture} key={fixture.key} />
      ))}
    </div>
  )
}

const FixtureCard = ({ fixture }: { fixture: Fixture }) => {
  const [tab, setTab] = useState("sliders")

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{fixture.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="sliders">Sliders</TabsTrigger>
          </TabsList>
          <TabsContent value="sliders" className="pt-2">
            {fixture.channels.map(channel => (
              <ChannelSlider
                key={channel.channelNo}
                universe={fixture.universe}
                id={channel.channelNo}
                description={channel.description}
              />
            ))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
