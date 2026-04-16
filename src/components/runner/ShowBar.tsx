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
  nextStackName?: string
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
  nextStackName,
  onGo,
  onBack,
}: ShowBarProps) {
  return (
    <div className="flex h-14 shrink-0 items-stretch border-b bg-card shadow-md">
      {/* DBO */}
      <div className="flex items-center gap-2.5 border-r px-4">
        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium text-muted-foreground uppercase">
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
        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium text-muted-foreground uppercase">
            BPM
          </div>
          <div className="font-mono text-xl font-semibold text-foreground min-w-14 text-center h-8 flex items-center justify-center">
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
            <div className="text-sm font-semibold text-green-400 truncate">
              {'\u25B6'} {activeName}
            </div>
            {standbyName ? (
              <div className="text-xs text-blue-400 truncate">
                {'\u25C9'}&ensp;{'next \u2014'} {standbyName}
              </div>
            ) : nextStackName ? (
              <div className="text-xs text-blue-400 truncate">
                {'\u2192'} {nextStackName}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col justify-center flex-1 min-w-0">
            <div className="text-sm text-muted-foreground truncate">
              {standbyName
                ? `${stackName}  \u00B7  \u25C9 ${standbyName}`
                : nextStackName
                  ? `${stackName}  \u00B7  \u2192 ${nextStackName}`
                  : `${stackName}  \u00B7  end of stack`}
            </div>
          </div>
        )}
      </div>

      {/* Keyboard hints */}
      <div className="flex flex-col items-center justify-center gap-0.5 border-r px-3.5">
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
          {'\u2190'} back
        </span>
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
          space: go
        </span>
      </div>

      {/* BACK */}
      <Button
        variant="ghost"
        onClick={onBack}
        className="h-full rounded-none px-5 font-bold text-sm text-muted-foreground border-r hover:bg-muted/30 hover:text-foreground uppercase"
      >
        {'\u25C0'} BACK
      </Button>

      {/* GO */}
      <Button
        onClick={onGo}
        className="h-full rounded-none px-10 text-2xl font-bold tracking-[0.16em] uppercase"
      >
        GO
      </Button>
    </div>
  )
}
