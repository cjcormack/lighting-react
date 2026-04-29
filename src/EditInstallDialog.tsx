import { useState, useEffect, Dispatch, SetStateAction } from "react"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import {
  useInstallQuery,
  useUpdateInstallMutation,
} from "./store/installs"

interface EditInstallDialogProps {
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
}

export default function EditInstallDialog({
  open,
  setOpen,
}: EditInstallDialogProps) {
  const { data: install, isLoading } = useInstallQuery(undefined, { skip: !open })
  const [updateInstall, { isLoading: isUpdating }] = useUpdateInstallMutation()

  const [friendlyName, setFriendlyName] = useState("")

  useEffect(() => {
    if (install) {
      setFriendlyName(install.friendlyName)
    }
  }, [install])

  const handleClose = () => {
    setOpen(false)
  }

  const handleSave = async () => {
    await updateInstall({ friendlyName: friendlyName.trim() }).unwrap()
    handleClose()
  }

  const isValid = friendlyName.trim().length > 0

  if (isLoading || !install) {
    return (
      <Sheet open={open} onOpenChange={open => !open && handleClose()}>
        <SheetContent className="flex flex-col sm:max-w-lg">
          <div className="flex justify-center p-8">
            <Loader2 className="size-6 animate-spin" />
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  const createdAt = new Date(install.createdAtMs).toLocaleString()

  return (
    <Sheet open={open} onOpenChange={open => !open && handleClose()}>
      <SheetContent className="flex flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Install settings</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This identifies the machine running lighting7. The friendly name appears in cloud-sync attribution and in exported project metadata.
            </p>
            <div className="space-y-2">
              <Label htmlFor="install-friendly-name">Friendly name *</Label>
              <Input
                id="install-friendly-name"
                value={friendlyName}
                onChange={e => setFriendlyName(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Install UUID</Label>
              <div className="font-mono text-xs break-all">{install.uuid}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Created</Label>
              <div className="text-sm">{createdAt}</div>
            </div>
          </div>
        </SheetBody>
        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isUpdating}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid || isUpdating}>
            {isUpdating ? "Saving..." : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
