import { Badge } from '@/components/ui/badge'

/**
 * How many busk pages hold a pad for a record, said the same way everywhere.
 *
 * One component rather than four copies because this block really is identical across templates and
 * Looks — unlike the `layerCount` messages beside it, which are deliberately worded per entity
 * ("Layers apply it" vs "Cues reference it") because they describe different relationships. Here
 * there is one relationship and one sentence, and a third busk-attachable record kind would
 * otherwise mean a fifth and sixth copy.
 *
 * Both render nothing at zero: a record on no page has nothing to say, and an "on 0 pages" badge
 * would be noise on most rows in the library.
 */
export function BuskPageCountBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
      on {count} page{count === 1 ? '' : 's'}
    </Badge>
  )
}

/**
 * The delete confirm's line. The pads go silently and without a second confirm — a pad is an
 * enrichment, not a use, so it gates nothing — which makes this the only warning there is.
 */
export function BuskPageCountWarning({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <>
      {' '}It has pads on {count} busk page{count === 1 ? '' : 's'}; those go with it.
    </>
  )
}
