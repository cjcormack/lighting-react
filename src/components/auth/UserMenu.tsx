import { useState } from "react"
import { CircleUser, LogOut } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import { RoleBadge } from "@/components/users/RoleBadge"
import { ProfileSheet } from "./ProfileSheet"
import ThemeToggle, { ThemeMenuItem } from "@/ThemeToggle"

// Words are filtered to those that *start* with a letter or digit, not merely contain one, so
// a name like "Chris C (desk)" initials as "CC" rather than "C(" — a parenthesised qualifier
// is the commonest shape here (a desk, a room, a role) and it should never be what the avatar
// shows. Anything with no usable word at all falls back to "?" rather than rendering
// punctuation.
function initials(displayName: string): string {
  const words = displayName
    .trim()
    .split(/\s+/)
    .filter((word) => /^[\p{L}\p{N}]/u.test(word))
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

export function UserMenu() {
  const { data } = useAuthStatusQuery()
  const [logout] = useLogoutMutation()
  const [profileOpen, setProfileOpen] = useState(false)

  const user = data?.user
  // Bootstrap-open: no users exist yet, so there is no identity to show. The setup screen is what
  // prompts for one.
  //
  // The theme control is the reason this returns *something* rather than null: it moved into the
  // menu below, so returning null here would take the only way to change theme with it. Handled
  // in this one place rather than by `Layout` re-testing `!user` beside its `<UserMenu/>` — the
  // same rule stated twice is this repo's recurring way of having it come true in only one of them.
  if (!user) return <ThemeToggle />

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
              <RoleBadge role={user.role} />
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {/* Three items, deliberately. Everything self-service — name, password, devices, the
              sign-in QR — is in the one sheet, and "Manage users" is gone: the `users` nav entry
              is already `adminOnly`, so the sidebar and Cmd+K carry that page and a second entry
              point here only meant role-filtering the same destination twice.

              Theme is the third, and it is the one thing here that is not about the account: it is
              a per-*viewer* display preference, which is the same kind of thing as the rest of
              this menu and not the same kind as the desk controls it used to sit among in the
              header — where, as a ninth icon button, it also did not fit a phone. */}
          <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
            <CircleUser className="size-4" />
            Profile…
          </DropdownMenuItem>
          <ThemeMenuItem />
          <DropdownMenuItem onSelect={() => void logout()}>
            <LogOut className="size-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProfileSheet user={user} open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  )
}
