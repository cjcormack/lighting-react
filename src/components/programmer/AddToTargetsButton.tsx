import { Crosshair } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { programmerPatchLayer } from '@/store/programmer'
import { useLookRowStore } from './LookRowStore'
import type { CueTarget } from '@/api/cuesApi'

/**
 * Bring a row inside the focused layer's targets.
 *
 * This is the *only* way a layer widens, and that is deliberate. In layer scope an untargeted row's
 * cells are shown but not editable, so a marquee dragged across the grid cannot quietly extend a
 * layer to the whole rig — the thing an operator would never be able to attribute to the drag they
 * just made. Widening is a press, on the row, next to Locate and Details.
 *
 * Reads only the store context, so it costs a mounted row nothing: the layer's target list rides on
 * the value the grid is already holding rather than a per-row query subscription.
 *
 * No optimistic update, matching `ProgrammerLookStack` — the programmer's layer state is a
 * broadcast, and the row un-dims when it lands. Restating it here would be a second opinion on a
 * stack this client does not own.
 */
export function AddToTargetsButton({
  target,
  fixtureKeys,
  name,
}: {
  /** What to append — a group row appends the group, which is what the operator means. */
  target: CueTarget
  /** Every fixture this row covers, so a group already fully targeted offers nothing. */
  fixtureKeys: readonly string[]
  name: string
}) {
  const store = useLookRowStore()
  // `targetedKeys === null` is "the Look's own targets" — every bound row lands where it names, so
  // there is nothing to widen. Reading it as "no targets" would put this button on every row.
  if (!store || store.targetedKeys === null) return null
  const targeted = store.targetedKeys
  if (fixtureKeys.length === 0 || fixtureKeys.every((key) => targeted.has(key))) return null

  const label = `Add ${name} to this layer's targets`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          aria-label={label}
          onClick={() =>
            programmerPatchLayer(store.layerId, { targets: [...store.targets, target] })
          }
        >
          <Crosshair className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
