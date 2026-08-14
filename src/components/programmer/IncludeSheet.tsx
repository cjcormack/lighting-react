import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, XCircle } from 'lucide-react'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { formatError } from '@/lib/formatError'
import { useProjectCueStackListQuery } from '@/store/cueStacks'
import { usePaletteListQuery } from '@/store/palettes'
import { AUTO_CUE_NUMBER_CLASS } from '@/lib/cueNumber'
import { PALETTE_TYPE_LABELS, PALETTE_TYPES } from '@/lib/paletteTypes'
import { PalettePreviewRow } from '@/components/palettes/paletteValue'
import { useInclude } from './useInclude'
import { MaskPicker } from './maskPicker'
import type { PropertyMaskGroup } from '@/store/programmerOps'

export interface IncludeSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
}

/**
 * Pick a cue *or a palette* to Include. Reached from the programmer toolbar; the Program view
 * includes straight from the cue row it is already showing, so it doesn't need this picker.
 *
 * One sheet with two tabs rather than two sheets, because the programmer has exactly one include
 * target: including a palette replaces an included cue, and a single picker is the honest shape
 * for a single-valued destination.
 */
export function IncludeSheet({ open, onOpenChange, projectId }: IncludeSheetProps) {
  const { data: stacks } = useProjectCueStackListQuery(projectId)
  const { data: palettes } = usePaletteListQuery({ projectId })
  const { include, isLoading, error, result, resetInclude } = useInclude(projectId, {
    toastErrors: false,
  })

  const [filter, setFilter] = useState('')
  const [mask, setMask] = useState<PropertyMaskGroup[]>([])

  // Once per open — `resetInclude` closes over RTK Query's `reset`, whose identity changes
  // with the mutation's state, so re-running on its identity would clear the "Included …"
  // confirmation the moment it appeared.
  const openedRef = useRef(false)
  useEffect(() => {
    if (!open) {
      openedRef.current = false
      return
    }
    if (openedRef.current) return
    openedRef.current = true
    setFilter('')
    setMask([])
    resetInclude()
  }, [open, resetInclude])

  const needle = filter.trim().toLowerCase()

  const matches = useMemo(() => {
    return (stacks ?? [])
      .filter((stack) => stack.type !== 'SEPARATOR')
      .map((stack) => ({
        stack,
        cues: (stack.cues ?? []).filter(
          (cue) =>
            needle === '' ||
            cue.name.toLowerCase().includes(needle) ||
            (cue.cueNumber ?? '').toLowerCase().includes(needle) ||
            stack.name.toLowerCase().includes(needle),
        ),
      }))
      .filter((entry) => entry.cues.length > 0)
  }, [stacks, needle])

  const paletteGroups = useMemo(
    () =>
      PALETTE_TYPES.map((type) => ({
        type,
        palettes: (palettes ?? []).filter(
          (palette) =>
            palette.type === type &&
            (needle === '' || palette.name.toLowerCase().includes(needle)),
        ),
      })).filter((group) => group.palettes.length > 0),
    [palettes, needle],
  )

  return (
    <Sheet open={open} onOpenChange={(next) => !isLoading && onOpenChange(next)}>
      <SheetContent className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Include</SheetTitle>
          <SheetDescription>
            Load a cue’s values and effects, or a palette’s contents, into the programmer — then
            edit them on stage and press Update.
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter"
            aria-label="Filter cues and palettes"
          />

          <MaskPicker value={mask} onChange={setMask} />

          {error != null && (
            <Alert variant="destructive">
              <XCircle className="size-4" />
              <AlertDescription>{formatError(error)}</AlertDescription>
            </Alert>
          )}

          {result && (
            <Alert>
              <AlertDescription>
                Included “{result.name}” — {result.entriesWritten} value
                {result.entriesWritten === 1 ? '' : 's'}
                {result.fxSpawned > 0 ? `, ${result.fxSpawned} effect(s)` : ''}
                {result.fxAlreadyRunning > 0
                  ? `. ${result.fxAlreadyRunning} effect(s) were already running on stage.`
                  : '.'}
              </AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="cues">
            <TabsList className="w-full">
              <TabsTrigger value="cues">Cues</TabsTrigger>
              <TabsTrigger value="palettes">Palettes</TabsTrigger>
            </TabsList>

            <TabsContent value="cues" className="space-y-3">
              {matches.map(({ stack, cues }) => (
                <div key={stack.id} className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{stack.name}</p>
                  {cues.map((cue) => (
                    <button
                      key={cue.id}
                      type="button"
                      disabled={isLoading}
                      onClick={() => include({ kind: 'CUE', cueId: cue.id }, mask)}
                      className="flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                    >
                      {cue.cueNumber && (
                        <span
                          className={cn(
                            'w-14 shrink-0 tabular-nums text-xs',
                            cue.cueNumberAuto && AUTO_CUE_NUMBER_CLASS,
                          )}
                        >
                          {cue.cueNumber}
                        </span>
                      )}
                      <span className="truncate">{cue.name}</span>
                    </button>
                  ))}
                </div>
              ))}
              {matches.length === 0 && <p className="text-sm text-muted-foreground">No cues match.</p>}
            </TabsContent>

            <TabsContent value="palettes" className="space-y-3">
              {/* Including a palette stages plain literals, not references — you are editing the
                  palette's own contents, and a slot referencing the thing it is about to
                  overwrite would mean nothing. The mask still applies on top of the palette's
                  type, which is itself a mask. */}
              {paletteGroups.map(({ type, palettes: group }) => (
                <div key={type} className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {PALETTE_TYPE_LABELS[type].plural}
                  </p>
                  {group.map((palette) => (
                    <button
                      key={palette.id}
                      type="button"
                      disabled={isLoading}
                      onClick={() => include({ kind: 'PALETTE', paletteId: palette.id }, mask)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                    >
                      <span className="min-w-0 flex-1 truncate">{palette.name}</span>
                      <PalettePreviewRow
                        type={palette.type}
                        preview={palette.preview.slice(0, 4)}
                        className="shrink-0"
                      />
                      <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                        {palette.targetCount} fx
                      </span>
                    </button>
                  ))}
                </div>
              ))}
              {paletteGroups.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No palettes match. Record one from the programmer to get started.
                </p>
              )}
            </TabsContent>
          </Tabs>
        </SheetBody>

        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {isLoading && (
            <Button disabled>
              <Loader2 className="size-4 animate-spin" />
              Including…
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
