import { Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EditorContextProvider } from '../lighting-editor/EditorContext'
import { usePersistentState } from '../../hooks/usePersistentState'
import { FixturesListContainer } from '../../routes/FixturesList'
import { ProgrammerToolbar } from './ProgrammerToolbar'

const GROUPED_KEY = 'programmer.grouped'

/**
 * The programmer sheet: the fixtures-list spreadsheet with per-cell ownership colouring and
 * the programmer's own toolbar. Every edit routes through `EditorContext { kind: 'live' }`,
 * which since the programmer redesign means "write the programmer", not "write DMX".
 *
 * Grouping is a toggle rather than a route split: busking a whole wash wants group rows,
 * plotting an individual mover wants the flat list, and both are the same sheet.
 */
export function ProgrammerSheet() {
  const [grouped, setGrouped] = usePersistentState<boolean>(GROUPED_KEY, false)

  return (
    <EditorContextProvider value={{ kind: 'live' }}>
      <FixturesListContainer
        grouped={grouped}
        showOwnership
        // Cmd+K's ?select= links target the fixtures/groups pair; consuming them here would
        // bounce a group select straight back out to /groups/list.
        enableDeepLinkSelect={false}
        toolbarExtra={
          <>
            <ProgrammerToolbar />
            <Button
              variant={grouped ? 'default' : 'outline'}
              size="sm"
              aria-pressed={grouped}
              onClick={() => setGrouped(!grouped)}
              title="Show group rows with their members"
            >
              <Layers className="size-3.5" />
              <span className="hidden sm:inline">Groups</span>
            </Button>
          </>
        }
      />
    </EditorContextProvider>
  )
}
