import { useNavigate, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface BreadcrumbsProps {
  projectName: string
  isActive?: boolean
  /** Current page name (e.g. "Fixtures", "Scripts"). Omit for project overview. */
  currentPage?: string
  /** Optional trailing segments shown after the current page (e.g. selected fixture/group names) */
  extra?: string[]
  /** Called when the currentPage segment is clicked (only active when extra segments are shown) */
  onCurrentPageClick?: () => void
  /** Called when an extra segment is clicked (receives the segment index) */
  onExtraClick?: (index: number) => void
}

export function Breadcrumbs({ projectName, isActive = true, currentPage, extra, onCurrentPageClick, onExtraClick }: BreadcrumbsProps) {
  const navigate = useNavigate()
  const { projectId } = useParams()

  return (
    <nav className="flex items-center gap-1 text-sm flex-wrap">
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

          {/* Current page + optional extra segments */}
          {extra && extra.length > 0 ? (
            <>
              <button
                onClick={onCurrentPageClick}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {currentPage}
              </button>
              {extra.map((segment, i) => {
                const isLast = i === extra.length - 1
                return (
                  <span key={i} className="contents">
                    <ChevronRight className="size-4 text-muted-foreground flex-shrink-0" />
                    {isLast ? (
                      <span className="font-medium truncate max-w-[300px]">{segment}</span>
                    ) : (
                      <button
                        onClick={() => onExtraClick?.(i)}
                        className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[300px]"
                      >
                        {segment}
                      </button>
                    )}
                  </span>
                )
              })}
            </>
          ) : onCurrentPageClick ? (
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
  )
}
