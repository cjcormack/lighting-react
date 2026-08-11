import { type ReactNode } from 'react'
import { BookOpenText, LayoutGrid, Pencil, Play, TableProperties } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'

export type ShowView = 'program' | 'run' | 'prompt-book'

const ITEM = 'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold'

/**
 * Program · Run · Prompt Book switcher shared across the three live-show views. The
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
        label="Program"
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

export type CardsListView = 'cards' | 'list'

/** localStorage keys remembering which view (cards or list) each page last
 *  used, so its single sidebar entry lands on the one you left. */
export const FIXTURES_VIEW_KEY = 'fixtures.view'
export const GROUPS_VIEW_KEY = 'groups.view'

export function setStoredCardsListView(key: string, view: CardsListView) {
  try {
    localStorage.setItem(key, JSON.stringify(view))
  } catch {
    // Storage unavailable (private mode, quota) — stickiness just degrades.
  }
}

/** Read-only counterpart for the cards routes' sticky redirect. Deliberately
 *  not usePersistentState: that hook writes the value back on every mount,
 *  and the redirect only needs a one-shot read. */
export function getStoredCardsListView(key: string): CardsListView {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '"cards"') === 'list' ? 'list' : 'cards'
  } catch {
    return 'cards'
  }
}

/** Location state the Cards segment attaches to its navigation. The cards
 *  routes skip their sticky redirect when they see it, so reaching Cards
 *  never depends on the localStorage write above having succeeded (writes
 *  can fail on quota-exhausted storage while reads keep returning 'list'). */
export const CARDS_LINK_STATE = { stickyView: 'cards' } as const

export function isCardsLinkState(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as { stickyView?: unknown }).stickyView === 'cards'
  )
}

/**
 * Cards · List switcher shared by a card-grid route and its list sibling.
 * Each segment records the choice BEFORE navigating — the cards route
 * redirects to the list when the stored view is 'list', so the Cards click
 * must overwrite the preference first or it could never get back.
 */
function CardsListSwitcher({
  current,
  cardsTo,
  listTo,
  storageKey,
}: {
  current: CardsListView
  cardsTo: string
  listTo: string
  storageKey: string
}) {
  return (
    <nav className="inline-flex items-center gap-0.5 rounded-lg border bg-card p-0.5">
      <Segment
        active={current === 'cards'}
        to={cardsTo}
        icon={<LayoutGrid className="size-3.5" />}
        label="Cards"
        state={CARDS_LINK_STATE}
        onClick={() => setStoredCardsListView(storageKey, 'cards')}
      />
      <Segment
        active={current === 'list'}
        to={listTo}
        icon={<TableProperties className="size-3.5" />}
        label="List"
        onClick={() => setStoredCardsListView(storageKey, 'list')}
      />
    </nav>
  )
}

/** Fixture cards (`/fixtures`) vs the flat spreadsheet list (`/fixtures/list`). */
export function FixturesViewSwitcher({
  current,
  projectId,
}: {
  current: CardsListView
  projectId: number
}) {
  return (
    <CardsListSwitcher
      current={current}
      cardsTo={`/projects/${projectId}/fixtures`}
      listTo={`/projects/${projectId}/fixtures/list`}
      storageKey={FIXTURES_VIEW_KEY}
    />
  )
}

/** Group cards (`/groups`) vs the grouped spreadsheet list (`/groups/list`). */
export function GroupsViewSwitcher({
  current,
  projectId,
}: {
  current: CardsListView
  projectId: number
}) {
  return (
    <CardsListSwitcher
      current={current}
      cardsTo={`/projects/${projectId}/groups`}
      listTo={`/projects/${projectId}/groups/list`}
      storageKey={GROUPS_VIEW_KEY}
    />
  )
}

function Segment({
  active,
  to,
  icon,
  label,
  state,
  onClick,
}: {
  active: boolean
  to: string
  icon: ReactNode
  label: string
  state?: unknown
  onClick?: () => void
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
      state={state}
      aria-label={label}
      onClick={onClick}
      className={cn(ITEM, 'text-muted-foreground hover:text-foreground')}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  )
}
