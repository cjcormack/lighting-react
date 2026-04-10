import { Braces, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Card } from '@/components/ui/card'
import type { ProjectScriptDetail } from '@/api/projectApi'
import { SCRIPT_TYPE_LABELS, getScriptDisplayUsage } from './scriptUtils'

interface ScriptListContentProps {
  scripts: ProjectScriptDetail[]
  isCurrentProject: boolean
  onSelect: (script: ProjectScriptDetail) => void
  onCreate: () => void
}

export function ScriptListContent({
  scripts,
  isCurrentProject,
  onSelect,
  onCreate,
}: ScriptListContentProps) {
  if (scripts.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Braces className="size-10 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">
          {isCurrentProject
            ? 'No scripts match the current filter.'
            : 'No scripts in this project.'}
        </p>
        {isCurrentProject && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 mt-4"
            onClick={onCreate}
          >
            <Plus className="size-4" />
            New Script
          </Button>
        )}
      </Card>
    )
  }

  return (
    <div className="space-y-1">
      {scripts.map((script) => (
        <ScriptRow
          key={script.id}
          script={script}
          onSelect={() => onSelect(script)}
        />
      ))}
    </div>
  )
}

function ScriptRow({
  script,
  onSelect,
}: {
  script: ProjectScriptDetail
  onSelect: () => void
}) {
  const usage = getScriptDisplayUsage(script)
  const UsageIcon = usage.icon

  return (
    <button
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm hover:bg-accent/50 transition-colors text-left"
      onClick={onSelect}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground shrink-0">
            <UsageIcon className="size-4" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="left">{usage.tooltip}</TooltipContent>
      </Tooltip>

      <span className="flex-1 truncate font-medium">{script.name}</span>

      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 hidden sm:inline-flex">
        {SCRIPT_TYPE_LABELS[script.scriptType]}
      </Badge>
    </button>
  )
}
