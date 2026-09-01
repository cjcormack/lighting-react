import { useNavigate, useParams } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface BreadcrumbsProps {
  projectName: string
  isActive?: boolean
  /** Current page name (e.g. "Fixtures", "Scripts"). Omit for project overview. */
  currentPage?: string
  /**
   * Called when the currentPage segment is clicked — Show uses it to leave a drilled stack.
   *
   * There used to be an `extra` array of trailing segments beside this, for a drill trail. Its
   * last consumer was the busk view, which listed the selected targets there and re-opened the
   * target picker from a click on one. The target band says both of those in the page itself, so
   * the trail is back to `Projects > Project > <View>` on every route.
   */
  onCurrentPageClick?: () => void
  /** When set, the full trail collapses to just this label below the `@[640px]` container width
   *  (needs a `@container` ancestor). Used by the show views so the breadcrumb can't overflow. */
  collapsedLabel?: string
}

export function Breadcrumbs({ projectName, isActive = true, currentPage, onCurrentPageClick, collapsedLabel }: BreadcrumbsProps) {
  const navigate = useNavigate()
  const { projectId } = useParams()

  return (
    <>
      {collapsedLabel && (
        <span className="@[640px]:hidden text-sm font-medium truncate max-w-full">
          {collapsedLabel}
        </span>
      )}
      <nav
        className={cn(
          'items-center gap-1 text-sm flex-wrap',
          collapsedLabel ? 'hidden @[640px]:flex' : 'flex',
        )}
      >
      <button
        onClick={() => navigate('/projects')}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        Projects
      </button>
      <ChevronRight className="size-4 text-muted-foreground flex-shrink-0" />

      {/* Project name - final segment if no currentPage */}
      {!currentPage ? (
        <span className="font-medium flex items-center gap-2">
          {projectName}
          <Badge variant={isActive ? "default" : "outline"} className="text-xs">
            {isActive ? "active" : "inactive"}
          </Badge>
        </span>
      ) : (
        <>
          <button
            onClick={() => navigate(`/projects/${projectId}`)}
            className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
          >
            {projectName}
            <Badge variant={isActive ? "default" : "outline"} className="text-xs">
              {isActive ? "active" : "inactive"}
            </Badge>
          </button>
          <ChevronRight className="size-4 text-muted-foreground flex-shrink-0" />

          {onCurrentPageClick ? (
            <button
              onClick={onCurrentPageClick}
              className="font-medium hover:text-muted-foreground transition-colors"
            >
              {currentPage}
            </button>
          ) : (
            <span className="font-medium">{currentPage}</span>
          )}
        </>
      )}
      </nav>
    </>
  )
}
