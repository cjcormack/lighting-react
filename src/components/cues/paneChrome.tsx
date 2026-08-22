import { Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/**
 * The small layout primitives the cue body and the programmer's layer stack share.
 *
 * Extracted from `LayersPane` when `LookStack` moved out of it: these three are used by the layer
 * stack, by the cue's assignment and effect sections and by the by-target cards, so leaving them in
 * either consumer would have made one import the other for a button.
 */
export function Section({
  title,
  icon,
  count,
  action,
  children,
}: {
  title: string
  icon?: React.ReactNode
  count?: number
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{title}</span>
        {count != null && count > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {count}
          </Badge>
        )}
        <span className="flex-1" />
        {action}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

export function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-[11px] gap-0.5"
      onClick={onClick}
    >
      <Plus className="size-3" />
      {label}
    </Button>
  )
}

export function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-6 text-muted-foreground hover:text-destructive shrink-0"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      aria-label="Remove"
    >
      <X className="size-3.5" />
    </Button>
  )
}
