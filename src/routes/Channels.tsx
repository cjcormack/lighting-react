import React from "react"
import { Card } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { useParams } from "react-router-dom"
import { useGetChannelQuery, useUpdateChannelMutation } from "../store/channels"

export const ChannelSlider = ({
  universe,
  id,
  description,
}: {
  universe: number
  id: number
  description?: string
}) => {
  const { data: maybeValue } = useGetChannelQuery({
    universe: universe,
    channelNo: id,
  })

  const value = maybeValue || 0

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

  const handleInputBlur = () => {
    if (value < 0) {
      setValue(0)
    } else if (value > 255) {
      setValue(255)
    }
  }

  return (
    <div className="space-y-2 py-2">
      <label className="text-sm font-medium">
        {description ? `${id}: ${description}` : `Channel ${id}`}
      </label>
      <div className="flex items-center gap-4">
        <Slider
          className="flex-1"
          value={[value]}
          max={255}
          step={1}
          onValueChange={handleSliderChange}
        />
        <Input
          type="number"
          value={value}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          min={0}
          max={255}
          className="w-16"
        />
      </div>
    </div>
  )
}

export default function Channels() {
  const { universe } = useParams()
  return (
    <Card className="m-4 p-4">
      <h1 className="text-3xl font-bold mb-6">Universe {universe}</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <ChannelGroups universe={Number(universe)} />
      </div>
    </Card>
  )
}

const ChannelGroups = ({ universe }: { universe: number }) => {
  const channelCount = 512
  const groupSize = 8

  return (
    <>
      {Array.from(Array(channelCount / groupSize)).map((_, groupNo) => (
        <Card key={groupNo} className="p-4">
          {Array.from(Array(groupSize)).map((_, itemNo) => {
            const channelNo = groupNo * groupSize + itemNo + 1
            return (
              <ChannelSlider key={itemNo} universe={universe} id={channelNo} />
            )
          })}
        </Card>
      ))}
    </>
  )
}
