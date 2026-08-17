import { useState } from "react"
import { KeyRound, LogOut } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuthStatusQuery, useLogoutMutation } from "@/store/auth"
import { ChangePasswordSheet } from "./ChangePasswordSheet"

function initials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

export function UserMenu() {
  const { data } = useAuthStatusQuery()
  const [logout] = useLogoutMutation()
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)

  const user = data?.user
  // Bootstrap-open: no users exist yet, so there is no identity to show. The setup
  // screen is what prompts for one; the header just stays as it was.
  if (!user) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-primary-foreground hover:bg-primary-foreground/10"
            aria-label={`Signed in as ${user.displayName}`}
          >
            <Avatar className="size-7">
              <AvatarFallback className="bg-primary-foreground/15 text-xs text-primary-foreground">
                {initials(user.displayName)}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="space-y-1">
            <div className="truncate font-medium">{user.displayName}</div>
            <div className="flex items-center gap-2">
              <span className="truncate text-xs font-normal text-muted-foreground">
                {user.username}
              </span>
              <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>
                {user.role === "ADMIN" ? "Admin" : "Operator"}
              </Badge>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {/* Session 3 adds "Manage users" here, alongside the /install/users route
              it points at. */}
          <DropdownMenuItem onSelect={() => setChangePasswordOpen(true)}>
            <KeyRound className="size-4" />
            Change password…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void logout()}>
            <LogOut className="size-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordSheet open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
    </>
  )
}
