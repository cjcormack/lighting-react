import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, Activity } from "lucide-react"
import { useClearGroupFxMutation, useGroupActiveEffectsQuery } from "../../store/groups"
import { AddFxDialog } from "./AddFxDialog"

interface GroupFxModeProps {
  groupName: string
  capabilities: string[]
}

export function GroupFxMode({ groupName, capabilities }: GroupFxModeProps) {
  const [addFxOpen, setAddFxOpen] = useState(false)
  const [clearGroupFx, { isLoading: isClearing }] = useClearGroupFxMutation()
  const { data: activeEffects = [], isLoading: isLoadingEffects } = useGroupActiveEffectsQuery(groupName)

  const handleClearAll = async () => {
    try {
      await clearGroupFx(groupName).unwrap()
    } catch (error) {
      console.error("Failed to clear effects:", error)
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Apply effects to all fixtures in this group. Effects will be distributed
        across members based on the selected distribution strategy.
      </div>

      <div className="flex gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={() => setAddFxOpen(true)}
          className="flex-1"
        >
          <Plus className="size-4 mr-1" />
          Add Effect
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleClearAll}
          disabled={isClearing || activeEffects.length === 0}
        >
          <Trash2 className="size-4 mr-1" />
          Clear All
        </Button>
      </div>

      {/* Active Effects List */}
      {isLoadingEffects ? (
        <div className="text-sm text-muted-foreground">Loading effects...</div>
      ) : activeEffects.length > 0 ? (
        <div className="space-y-2">
          <div className="text-sm font-medium">Active Effects</div>
          <div className="space-y-2">
            {activeEffects.map((effect) => (
              <div
                key={effect.id}
                className="flex flex-wrap items-center gap-2 p-2 rounded-md bg-muted/50"
              >
                <Activity className={`size-4 ${effect.isRunning ? 'text-green-500' : 'text-muted-foreground'}`} />
                <span className="font-medium capitalize">{effect.effectType}</span>
                <Badge variant="secondary">{effect.propertyName}</Badge>
                <Badge variant="outline">{effect.beatDivision}x</Badge>
                <Badge variant="outline" className="text-xs">{effect.distribution}</Badge>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground italic">No active effects</div>
      )}

      <AddFxDialog
        open={addFxOpen}
        onOpenChange={setAddFxOpen}
        groupName={groupName}
        capabilities={capabilities}
      />
    </div>
  )
}
