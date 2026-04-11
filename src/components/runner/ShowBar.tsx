import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ShowBarProps {
  dbo: boolean
  onDbo: () => void
  bpm: number | null
  onTap: () => void
  stackName: string
  activeName: string | null
  standbyName: string | null
  onGo: () => void
  onBack: () => void
}

export function ShowBar({
  dbo,
  onDbo,
  bpm,
  onTap,
  stackName,
  activeName,
  standbyName,
  onGo,
  onBack,
}: ShowBarProps) {
  return (
    <div className="flex h-14 shrink-0 items-stretch border-b bg-card shadow-md">
      {/* DBO */}
      <div className="flex items-center gap-2.5 border-r px-4">
        <div>
          <div className="text-[9px] font-bold tracking-widest text-muted-foreground/40 uppercase mb-1">
            Blackout
          </div>
          <Button
            variant={dbo ? 'destructive' : 'outline'}
            size="sm"
            onClick={onDbo}
            className={cn(
              'font-bold tracking-wider',
              dbo && 'shadow-[0_0_20px_rgba(200,32,32,0.55)]',
            )}
          >
            DBO
          </Button>
        </div>
      </div>

      {/* BPM + Tap */}
      <div className="flex items-center gap-2.5 border-r px-4">
        <div>
          <div className="text-[9px] font-bold tracking-widest text-muted-foreground/40 uppercase">
            BPM
          </div>
          <div className="font-mono text-xl font-semibold text-muted-foreground/50 min-w-14 text-center">
            {bpm ?? '\u2014'}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onTap} className="font-bold tracking-wider">
          TAP
        </Button>
      </div>

      {/* Cue info */}
      <div className="flex flex-1 items-center gap-2.5 px-4 min-w-0 overflow-hidden">
        {activeName ? (
          <div className="flex flex-col justify-center gap-0.5 flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-amber-400 truncate">
              {'\u25B6'} {activeName}
            </div>
            {standbyName && (
              <div className="text-[11px] text-green-500 truncate">
                {'\u25C9'}&ensp;{'next \u2014'} {standbyName}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col justify-center flex-1 min-w-0">
            <div className="text-[13px] text-muted-foreground/40 truncate">
              {standbyName
                ? `${stackName}  \u00B7  \u25C9 ${standbyName}`
                : `${stackName}  \u00B7  end of stack`}
            </div>
          </div>
        )}
      </div>

      {/* Keyboard hints */}
      <div className="flex flex-col items-center justify-center gap-0.5 border-r px-3.5">
        <span className="text-[9px] font-semibold tracking-wider text-muted-foreground/20 uppercase whitespace-nowrap">
          {'\u2190'} back
        </span>
        <span className="text-[9px] font-semibold tracking-wider text-muted-foreground/20 uppercase whitespace-nowrap">
          space: go
        </span>
      </div>

      {/* BACK */}
      <button
        onClick={onBack}
        className="h-full px-5 font-bold tracking-wider text-[13px] text-muted-foreground/30 border-r transition-colors hover:bg-muted/30 hover:text-muted-foreground/60 uppercase"
      >
        {'\u25C0'} BACK
      </button>

      {/* GO */}
      <button
        onClick={onGo}
        className="h-full px-10 text-2xl font-bold tracking-[0.16em] text-green-400 bg-green-950/40 transition-all hover:bg-green-900/50 hover:shadow-[inset_0_0_24px_rgba(74,222,128,0.12)] active:bg-green-800/50 uppercase"
      >
        GO
      </button>
    </div>
  )
}
