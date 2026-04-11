import { Badge } from '@/components/ui/badge'

interface MarkerRowProps {
  name: string
}

export function MarkerRow({ name }: MarkerRowProps) {
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2">
      <div className="flex-1 h-px bg-border/50" />
      <Badge variant="outline" className="text-[10px] tracking-widest uppercase font-bold text-muted-foreground/40 border-muted-foreground/20 bg-card rounded-sm">
        {name}
      </Badge>
      <div className="flex-1 h-px bg-border/50" />
    </div>
  )
}
