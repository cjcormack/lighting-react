import { Badge } from '@/components/ui/badge'

interface MarkerRowProps {
  name: string
}

export function MarkerRow({ name }: MarkerRowProps) {
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2">
      <div className="flex-1 h-px bg-border" />
      <Badge variant="outline" className="text-xs font-medium text-muted-foreground bg-card rounded-sm">
        {name}
      </Badge>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}
