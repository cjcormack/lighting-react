import { type ReactNode } from 'react'
import { BookOpenText, Pencil, Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export type ShowView = 'program' | 'run' | 'prompt-book'

const ITEM = 'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold'

/**
 * Edit · Run · Prompt Book switcher shared across the three live-show views. The
 * `current` view renders as a static pill; the other two are links. Icons show at
 * every width — only the text labels collapse below `sm` — so the switch stays
 * usable on phones (the sole in-view way to move between the three on a narrow screen).
 */
export function ViewSwitcher({ current, projectId }: { current: ShowView; projectId: number }) {
  return (
    <nav className="inline-flex items-center gap-0.5 rounded-lg border bg-card p-0.5">
      <Segment
        active={current === 'program'}
        to={`/projects/${projectId}/program`}
        icon={<Pencil className="size-3.5" />}
        label="Edit"
      />
      <Segment
        active={current === 'run'}
        to={`/projects/${projectId}/run`}
        icon={<Play className="size-3.5" />}
        label="Run"
      />
      <Segment
        active={current === 'prompt-book'}
        to={`/projects/${projectId}/prompt-book`}
        icon={<BookOpenText className="size-3.5" />}
        label="Prompt Book"
      />
    </nav>
  )
}

function Segment({
  active,
  to,
  icon,
  label,
}: {
  active: boolean
  to: string
  icon: ReactNode
  label: string
}) {
  if (active) {
    return (
      <span className={cn(ITEM, 'bg-muted text-foreground')} aria-current="page" aria-label={label}>
        {icon}
        <span className="hidden sm:inline">{label}</span>
      </span>
    )
  }
  return (
    <Link
      to={to}
      aria-label={label}
      className={cn(ITEM, 'text-muted-foreground hover:text-foreground')}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  )
}
