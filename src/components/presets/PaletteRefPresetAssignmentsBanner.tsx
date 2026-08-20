import { useMemo, useState } from 'react'
import { Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MakeHardDialog } from '@/components/palettes/MakeHardDialog'
import { isPaletteRefValue } from '@/lib/programmerValue'
import type { FxPreset, FxPresetPropertyAssignment } from '@/api/fxPresetsApi'

interface PaletteRefPresetAssignmentsBannerProps {
  projectId: number
  presetId: number
  presetName: string
  assignments: FxPresetPropertyAssignment[]
  /**
   * Non-null when the draft has unsaved changes — the reason the button is disabled. Saving is
   * a wholesale replace of every assignment, so a Save issued after a server-side harden would
   * put the reference straight back.
   */
  blockedReason?: string | null
  /** The preset as the server now holds it, after a successful harden. */
  onHardened: (preset: FxPreset) => void
}

/**
 * Surfaces preset property assignments that hold a palette reference, and offers Make Hard.
 *
 * Sibling of [DeadPresetAssignmentsBanner] and deliberately not styled as an error: a reference
 * is a perfectly healthy row. It gets a banner because nothing else in this editor shows one — the
 * property cells parse `ref:{uuid}` through the ordinary literal parser, which answers *white* for
 * anything it doesn't recognise, so a referencing colour row otherwise renders as a plausible
 * wrong value.
 */
export function PaletteRefPresetAssignmentsBanner({
  projectId,
  presetId,
  presetName,
  assignments,
  blockedReason,
  onHardened,
}: PaletteRefPresetAssignmentsBannerProps) {
  const [open, setOpen] = useState(false)
  /**
   * The reference count as it stood when the dialog opened.
   *
   * Frozen, because a successful harden empties `refRows` — a live count would flip the dialog's
   * own description to "0 palette references" while its result summary is still on screen.
   */
  const [openedCount, setOpenedCount] = useState(0)

  const refRows = useMemo(
    () => assignments.filter((row) => isPaletteRefValue(row.value)),
    [assignments],
  )

  // The banner itself disappears the instant the last reference hardens — but the dialog is *its*
  // child, so returning null here would take the "N rows hardened" summary down with it and the
  // operator would watch the confirmation flash out of existence. While the dialog is open only
  // the banner body goes.
  if (refRows.length === 0 && !open) return null

  return (
    <>
      {refRows.length > 0 && (
        <div className="rounded-md border bg-muted/30 p-2 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Link2 className="size-3.5 text-muted-foreground" />
            {refRows.length === 1
              ? '1 row references a palette'
              : `${refRows.length} rows reference a palette`}
            <span className="text-[11px] font-normal text-muted-foreground ml-1">
              — {refRows.map((row) => row.propertyName).join(', ')}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto h-6 px-1.5 text-[10px]"
              disabled={blockedReason != null}
              onClick={() => {
                setOpenedCount(refRows.length)
                setOpen(true)
              }}
              title={blockedReason ?? 'Replace these references with the values they resolve to'}
            >
              Make hard
            </Button>
          </div>
          {blockedReason != null && (
            <p className="text-[11px] text-muted-foreground">{blockedReason}</p>
          )}
        </div>
      )}
      <MakeHardDialog
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        scope={{
          kind: 'preset',
          presetId,
          presetName,
          referenceCount: openedCount,
          onHardened,
        }}
      />
    </>
  )
}
