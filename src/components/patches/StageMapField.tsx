import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { clamp } from '@/lib/utils'

const X_MIN = 2
const X_MAX = 98
const Y_MIN = 4
const Y_MAX = 94

export interface StageMapValue {
  stageX: number | null
  stageY: number | null
}

export interface StageMapOtherFixture {
  id: number
  stageX: number
  stageY: number
  name: string
}

interface StageMapFieldProps {
  value: StageMapValue
  onChange: (next: StageMapValue) => void
  otherFixtures: StageMapOtherFixture[]
  selfLabel: string
  selfRiggingPosition: string | null
}

export function StageMapField({
  value,
  onChange,
  otherFixtures,
  selfLabel,
  selfRiggingPosition,
}: StageMapFieldProps) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)

  const placed = value.stageX != null && value.stageY != null

  const setPosFromEvent = (clientX: number, clientY: number) => {
    const el = stageRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = clamp(((clientX - r.left) / r.width) * 100, X_MIN, X_MAX)
    const y = clamp(((clientY - r.top) / r.height) * 100, Y_MIN, Y_MAX)
    onChange({ stageX: x, stageY: y })
  }

  useEffect(() => {
    if (!dragging) return
    const handleMove = (e: MouseEvent) => setPosFromEvent(e.clientX, e.clientY)
    const handleUp = () => setDragging(false)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground/60 flex-1">
          Click or drag to place
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onChange({ stageX: 50, stageY: 50 })}
        >
          Center
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={() => onChange({ stageX: null, stageY: null })}
          disabled={!placed}
        >
          Unplace
        </Button>
      </div>
      <div
        ref={stageRef}
        className="relative w-full aspect-[16/10] border border-border rounded-md overflow-hidden cursor-crosshair select-none bg-muted/40"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(127,127,127,0.06) 0 1px, transparent 1px 24px), repeating-linear-gradient(90deg, rgba(127,127,127,0.06) 0 1px, transparent 1px 24px)',
        }}
        onMouseDown={(e) => {
          setPosFromEvent(e.clientX, e.clientY)
          setDragging(true)
        }}
      >
        <div className="absolute top-1.5 left-0 right-0 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 pointer-events-none">
          Upstage
        </div>
        <div className="absolute bottom-1.5 left-0 right-0 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 pointer-events-none">
          Downstage
        </div>
        <div className="absolute inset-x-0 top-1/2 h-px bg-foreground/10 pointer-events-none" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/10 pointer-events-none" />

        {otherFixtures.map((o) => (
          <div
            key={o.id}
            className="absolute w-2 h-2 rounded-full bg-foreground/30 pointer-events-none"
            style={{
              left: `${o.stageX}%`,
              top: `${o.stageY}%`,
              transform: 'translate(-50%, -50%)',
              opacity: 0.25,
            }}
            title={o.name}
          />
        ))}

        {placed && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${value.stageX}%`,
              top: `${value.stageY}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="w-3 h-3 rounded-full bg-primary ring-2 ring-primary/30" />
            <div className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-foreground/90 bg-background/80 px-1 rounded-sm">
              {selfLabel}
              {selfRiggingPosition ? ` · ${selfRiggingPosition}` : ''}
            </div>
          </div>
        )}

        {placed && (
          <div className="absolute right-2 bottom-2 text-[10px] font-mono text-muted-foreground bg-background/70 px-1.5 py-0.5 rounded-sm pointer-events-none">
            x {Math.round(value.stageX!)} · y {Math.round(value.stageY!)}
          </div>
        )}
      </div>
    </div>
  )
}
