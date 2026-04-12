import { useState, useRef, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface ProgramMarkerRowProps {
  name: string
  onRename: (name: string) => void
  onDelete: () => void
}

export function ProgramMarkerRow({ name, onRename, onDelete }: ProgramMarkerRowProps) {
  const [localName, setLocalName] = useState(name)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLocalName(name)
  }, [name])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const debouncedRename = useCallback(
    (value: string) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        if (value.trim()) onRename(value.trim())
      }, 400)
    },
    [onRename],
  )

  return (
    <div className="flex items-center gap-2.5 py-2 px-4 hover:bg-muted/10 transition-colors">
      <div className="flex-1 h-px bg-border/30" />
      <Input
        value={localName}
        onChange={(e) => {
          setLocalName(e.target.value)
          debouncedRename(e.target.value)
        }}
        onClick={(e) => e.stopPropagation()}
        className="h-7 w-auto min-w-[120px] max-w-[200px] text-center text-[11px] font-bold tracking-[0.1em] uppercase text-muted-foreground/50 bg-card border-border/50"
      />
      <div className="flex-1 h-px bg-border/30" />
      <button
        className="size-5 flex items-center justify-center text-muted-foreground/20 hover:text-destructive transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
