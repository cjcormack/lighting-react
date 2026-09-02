import { useState } from 'react'
import { useSelector } from 'react-redux'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AddEditFxSheet, type FxTarget } from '@/components/fx/AddEditFxSheet'
import { useFixtureListQuery } from '@/store/fixtures'
import { useGroupListQuery } from '@/store/groups'
import { useAbsorbLookEffectsMutation } from '@/store/looks'
import { selectTargetKeys } from '@/store/selectionSlice'
import { useLookRowStore } from './LookRowStore'
import { useProgrammerScope } from './ProgrammerScope'

/**
 * `+ Effect`, landing wherever the focused scope's values land.
 *
 * One rule, applied to effects as it is to values, rather than a special case:
 *
 * - **a layer** — into that Look, as a `LookEffect`. It travels with the Look, so every other layer
 *   applying it starts running the effect too.
 * - **Local** — into the programmer band, which is what a busked effect is. Record then writes it
 *   onto the cue as an ad-hoc child. Local has no Look to put it in, and that is exactly right: an
 *   effect you want *here only* belongs to the cue.
 * - **Output** — disabled. Output is a read of what every entry produced together; it owns nothing,
 *   so there is nowhere for a new effect to go. The tooltip names the two places that can take one,
 *   because "disabled" on its own teaches nobody.
 *
 * The authoring UI is unchanged — `AddEditFxSheet` as it stands, which is deliberate: this session
 * changes where an effect *lands*, not how a parameter is set. The layer case creates the instance
 * in the band exactly as Local does and then moves it, because that is the only order in which the
 * effect is a real running thing the server can describe rather than a form the client is guessing
 * at.
 */
export function ProgrammerAddEffect() {
  const scope = useProgrammerScope()
  const store = useLookRowStore()
  const [open, setOpen] = useState(false)
  const [absorb] = useAbsorbLookEffectsMutation()
  const { data: fixtures } = useFixtureListQuery()
  const { data: groups } = useGroupListQuery()
  const selectedKeys = useSelector((s: Parameters<typeof selectTargetKeys>[0]) =>
    selectTargetKeys(s, 'programmer'),
  )

  if (!scope) return null

  // A **template layer takes no effect from here**, and the reason has changed rather than gone.
  // It used to be D7 — a template held no effects at all. A template may now hold one
  // (fx-templates D1), but exactly one, fixed at creation: there is no gesture for adding a second,
  // and adding a *first* to a value template would flip what it holds, which is its identity. A
  // focused template layer has no `LookRowStore` either, so without this the button would offer to
  // absorb an effect into nothing at all.
  const templateFocused = scope.kind === 'layer' && store == null

  // An effect needs one target to be authored against. The selection is the operator's own answer
  // to "which heads?", and `AddEditFxSheet` offers the distribution controls once it knows whether
  // that target is multi-head — so a group beats a fixture where the selection is a group.
  const group = groups?.find((g) => selectedKeys.includes(g.name))
  const fixture = fixtures?.find((f) => selectedKeys.includes(f.key))
  const target: FxTarget | null = group
    ? { type: 'group', group }
    : fixture
      ? { type: 'fixture', fixture }
      : null

  const reason =
    scope.kind === 'output'
      ? 'Output is a read of everything composed together, so it owns nothing. Switch to Local for an effect on this cue, or focus a layer to put one in its look.'
      : templateFocused
        ? 'A template holds one thing — a value, or one effect chosen when it was made. Edit it in the template library, switch to Local for an effect on this cue, or focus a look layer to put one in its look.'
        : target == null
          ? 'Select the heads the effect should drive first.'
          : scope.kind === 'layer'
            ? `Add an effect to ${store?.lookName ?? 'this look'} — every layer using it will run it`
            : 'Add an effect to the programmer. Record writes it onto the cue.'
  const disabled = scope.kind === 'output' || templateFocused || target == null

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => setOpen(true)}
            aria-label="Add an effect"
          >
            <Plus className="size-3.5" />
            Effect
          </Button>
        </TooltipTrigger>
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
      {open && target && (
        <AddEditFxSheet
          target={target}
          mode={{ mode: 'add' }}
          programmerOwned
          onCreated={(effectId) => {
            // Layer scope only: move it out of the band and into the focused Look. The store's
            // `lookId` rather than the scope's `layerId`, because a Look is what holds effects —
            // two layers may apply the same one.
            if (scope.kind === 'layer' && store) {
              void absorb({ projectId: store.projectId, lookId: store.lookId, effectIds: [effectId] })
            }
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
