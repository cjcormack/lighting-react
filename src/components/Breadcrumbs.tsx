import { useNavigate, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface BreadcrumbsProps {
  projectName: string
  currentPage: string
  /** Optional trailing segments shown after the current page (e.g. selected fixture/group names) */
  extra?: string[]
  /** Called when the currentPage segment is clicked (only active when extra segments are shown) */
  onCurrentPageClick?: () => void
  /** Called when the extra segment is clicked */
  onExtraClick?: () => void
}

export function Breadcrumbs({ projectName, currentPage, extra, onCurrentPageClick, onExtraClick }: BreadcrumbsProps) {
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
      <button
        onClick={() => navigate(`/projects/${projectId}`)}
        className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
      >
        {projectName}
        <Badge variant="default" className="text-xs">
          active
        </Badge>
      </button>
      <ChevronRight className="size-4 text-muted-foreground flex-shrink-0" />
      {extra && extra.length > 0 ? (
        <>
          <button
            onClick={onCurrentPageClick}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {currentPage}
          </button>
          <ChevronRight className="size-4 text-muted-foreground flex-shrink-0" />
          {onExtraClick ? (
            <button
              onClick={onExtraClick}
              className="font-medium truncate max-w-[300px] hover:text-muted-foreground transition-colors"
            >
              {extra.join(', ')}
            </button>
          ) : (
            <span className="font-medium truncate max-w-[300px]">{extra.join(', ')}</span>
          )}
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
    </nav>
  )
}
