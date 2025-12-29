import { Suspense, useState } from "react"
import { Plus, MinusCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ScriptSetting } from "@/store/scripts"
import AddScriptDialog from "@/AddScriptDialog"

// A flexible setting type that accepts any type string (for display purposes)
export interface SettingDisplay {
  type: string
  name: string
  minValue?: number
  maxValue?: number
  defaultValue?: number
}

interface ScriptSettingsTableProps<T extends SettingDisplay = ScriptSetting> {
  settings: readonly T[]
  onAddSetting?: (setting: ScriptSetting) => void
  onRemoveSetting?: (setting: T) => void
  readOnly?: boolean
}

export function ScriptSettingsTable<T extends SettingDisplay = ScriptSetting>({
  settings,
  onAddSetting,
  onRemoveSetting,
  readOnly = false,
}: ScriptSettingsTableProps<T>) {
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  const handleAddSetting = (setting: ScriptSetting) => {
    onAddSetting?.(setting)
  }

  return (
    <>
      {!readOnly && onAddSetting && (
        <Suspense fallback={<div>Loading...</div>}>
          <AddScriptDialog
            open={addDialogOpen}
            setOpen={setAddDialogOpen}
            addSetting={handleAddSetting}
          />
        </Suspense>
      )}
      <Card className="p-4 m-2 flex flex-col min-w-0">
        <h2 className="text-xl font-semibold mb-4">Settings</h2>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Details</TableHead>
                <TableHead className="text-right">
                  {!readOnly && onAddSetting && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAddDialogOpen(true)}
                    >
                      <Plus className="size-4" />
                      Add
                    </Button>
                  )}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.length ? (
                settings.map(setting => (
                  <TableRow key={setting.name}>
                    <TableCell className="font-medium">{setting.type}</TableCell>
                    <TableCell>{setting.name}</TableCell>
                    <TableCell>
                      min: {setting.minValue ?? "—"}; max: {setting.maxValue ?? "—"}; default:{" "}
                      {setting.defaultValue ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {!readOnly && onRemoveSetting && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onRemoveSetting(setting)}
                        >
                          <MinusCircle className="size-5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No settings
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </>
  )
}
