import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PalettePreviewRow } from './paletteValue'
import type { PaletteSummary } from '@/api/palettesApi'

export interface PaletteGridProps {
  palettes: readonly PaletteSummary[]
  onOpen: (palette: PaletteSummary) => void
  /** Rendered in the empty state so each type page can say how to make its first one. */
  emptyHint?: string
}

/**
 * The bank of palettes for one type.
 *
 * Tiles render entirely from the summary — `preview`, `targetCount` and `referenceCount` are
 * computed server-side precisely so a page of twenty tiles costs one request rather than
 * twenty-one.
 */
export function PaletteGrid({ palettes, onOpen, emptyHint }: PaletteGridProps) {
  if (palettes.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">No palettes of this type yet.</p>
        {emptyHint && <p className="mt-1 text-xs text-muted-foreground">{emptyHint}</p>}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
      {palettes.map((palette) => (
        <PaletteTile key={palette.id} palette={palette} onOpen={() => onOpen(palette)} />
      ))}
    </div>
  )
}

export function PaletteTile({
  palette,
  onOpen,
}: {
  palette: PaletteSummary
  onOpen: () => void
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className="cursor-pointer gap-2 p-3 hover:bg-accent/30"
      aria-label={`Open palette ${palette.name}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{palette.name}</span>
        {/* Only shown when non-zero: a "0 uses" badge on every tile in a fresh show is noise,
            but "used by 4 rows" is the number that decides whether a delete is safe. */}
        {palette.referenceCount > 0 && (
          <Badge variant="secondary" className="shrink-0 px-1 text-[10px]">
            {palette.referenceCount}
          </Badge>
        )}
      </div>
      <PalettePreviewRow type={palette.type} preview={palette.preview} />
      <p className="text-xs text-muted-foreground">
        {palette.targetCount} fixture{palette.targetCount === 1 ? '' : 's'} · {palette.entryCount}{' '}
        value{palette.entryCount === 1 ? '' : 's'}
      </p>
      {palette.notes && <p className="truncate text-xs text-muted-foreground">{palette.notes}</p>}
    </Card>
  )
}
