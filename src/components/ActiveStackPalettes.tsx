import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layers } from 'lucide-react'
import { useFxStateQuery } from '@/store/fx'
import { useCurrentProjectQuery } from '@/store/projects'
import { useProjectCueStackListQuery } from '@/store/cueStacks'
import { resolveColourToHex } from '@/components/fx/colourUtils'

interface ActiveStackPaletteInfo {
  stackId: number
  stackName: string
  palette: string[]
}

/**
 * Shows compact inline palette chips for each active cue stack, using the
 * real effective palette from the backend (via fxState.stackPalettes).
 * Clicking navigates to the stack's cue page.
 */
export function ActiveStackPalettes() {
  const { data: fxState } = useFxStateQuery()
  const { data: currentProject } = useCurrentProjectQuery()
  const projectId = currentProject?.id ?? 0
  const { data: stacks } = useProjectCueStackListQuery(projectId, {
    skip: !currentProject?.id,
  })
  const navigate = useNavigate()

  const activeStacks = useMemo<ActiveStackPaletteInfo[]>(() => {
    const stackPalettes = fxState?.stackPalettes
    if (!stackPalettes || !stacks) return []

    return Object.entries(stackPalettes)
      .filter(([, palette]) => palette.length > 0)
      .map(([idStr, palette]) => {
        const stackId = Number(idStr)
        const stack = stacks.find((s) => s.id === stackId)
        return {
          stackId,
          stackName: stack?.name ?? `Stack ${stackId}`,
          palette,
        }
      })
  }, [fxState?.stackPalettes, stacks])

  if (activeStacks.length === 0) return null

  return (
    <>
      {activeStacks.map(({ stackId, stackName, palette }) => (
        <button
          key={stackId}
          type="button"
          className="flex items-center gap-1.5 rounded-full border border-border/60 pl-2 pr-1.5 py-0.5 hover:bg-accent/50 transition-colors text-left shrink-0"
          onClick={() =>
            navigate(`/projects/${projectId}/cues/stacks/${stackId}`)
          }
          title={`Stack "${stackName}" — click to edit`}
        >
          <Layers className="size-3 text-muted-foreground shrink-0" />
          <span className="text-[11px] text-muted-foreground truncate max-w-[10ch]">
            {stackName}
          </span>
          <div className="flex items-center gap-0.5">
            {palette.slice(0, 6).map((colour, i) => {
              const hex = resolveColourToHex(colour)
              return (
                <div
                  key={i}
                  className="size-4 rounded-sm border border-border/50"
                  style={{ backgroundColor: hex }}
                />
              )
            })}
            {palette.length > 6 && (
              <span className="text-[10px] text-muted-foreground ml-0.5">
                +{palette.length - 6}
              </span>
            )}
          </div>
        </button>
      ))}
    </>
  )
}
