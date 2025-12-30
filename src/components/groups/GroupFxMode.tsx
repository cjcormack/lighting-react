import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, Trash2 } from "lucide-react"
import { useClearGroupFxMutation } from "../../store/groups"
import { AddFxDialog } from "./AddFxDialog"

interface GroupFxModeProps {
  groupName: string
  capabilities: string[]
}

export function GroupFxMode({ groupName, capabilities }: GroupFxModeProps) {
  const [addFxOpen, setAddFxOpen] = useState(false)
  const [clearGroupFx, { isLoading: isClearing }] = useClearGroupFxMutation()

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
          disabled={isClearing}
        >
          <Trash2 className="size-4 mr-1" />
          Clear All
        </Button>
      </div>

      <AddFxDialog
        open={addFxOpen}
        onOpenChange={setAddFxOpen}
        groupName={groupName}
        capabilities={capabilities}
      />
    </div>
  )
}
