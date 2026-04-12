import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ShowSessionDetails } from '@/api/showSessionsApi'

interface SessionPickerProps {
  sessions: ShowSessionDetails[] | undefined
  onCreateSession: (name: string) => void
  onActivateSession: (sessionId: number) => void
}

export function SessionPicker({ sessions, onCreateSession, onActivateSession }: SessionPickerProps) {
  const [newSessionName, setNewSessionName] = useState('')

  const handleCreate = () => {
    const name = newSessionName.trim()
    if (!name) return
    onCreateSession(name)
    setNewSessionName('')
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
      <div className="w-full max-w-[480px] mb-2">
        <h2 className="text-lg font-semibold">
          Choose Session
        </h2>
      </div>
      <div className="flex gap-2 w-full max-w-[480px]">
        <Input
          className="flex-1"
          placeholder="New session name..."
          value={newSessionName}
          onChange={(e) => setNewSessionName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          autoFocus
        />
        <Button
          className="shrink-0"
          onClick={handleCreate}
          disabled={!newSessionName.trim()}
        >
          Create
        </Button>
      </div>
      {sessions && sessions.length > 0 && (
        <>
          <div className="flex items-center gap-2.5 w-full max-w-[480px] my-1">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs font-medium text-muted-foreground">
              or resume existing
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="w-full max-w-[480px] flex flex-col gap-2">
            {sessions.map((s) => {
              const stackCount = s.entries.filter((e) => e.entryType === 'STACK').length
              return (
                <div
                  key={s.id}
                  className="flex items-center px-4 py-3.5 bg-card border rounded-md gap-3.5 hover:bg-muted/20 hover:border-muted-foreground/20 transition-colors"
                >
                  <span className="flex-1 text-sm font-semibold text-foreground">
                    {s.name}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {stackCount} stack{stackCount !== 1 ? 's' : ''}
                  </span>
                  <Button
                    size="sm"
                    className="shrink-0"
                    onClick={() => onActivateSession(s.id)}
                  >
                    Activate
                  </Button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
