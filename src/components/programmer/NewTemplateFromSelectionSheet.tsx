import { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ATTRIBUTE_FAMILIES, FAMILY_LABELS, type AttributeFamily } from '@/lib/attributeFamily'
import { useCreateTemplateFromProgrammerMutation } from '@/store/templates'
import { selectTargetKeys } from '@/store/selectionSlice'
import { formatError } from '@/lib/formatError'

/**
 * Record the selection as a new template — the strip's *New from selection* chip.
 *
 * Deliberately a small sheet, not the editor. Everything the editor asks is either already decided
 * (the family comes from the selection, the values come from the rig) or does not apply yet, so all
 * that is left is a name. Reusing `TemplateEditor` here would mean showing a family-native control
 * that the recorded values are about to overwrite.
 *
 * **One family, chosen not asked** where the selection says so. A marquee across the Colour column
 * means colour; with several families in the selection the operator picks, because a template holds
 * exactly one and guessing would silently drop the rest.
 */
export function NewTemplateFromSelectionSheet({
  open,
  onOpenChange,
  projectId,
  families,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  /** The families the selection is asking about, or null when the gesture named none. */
  families: AttributeFamily[] | null
}) {
  const [record, { isLoading, error, reset }] = useCreateTemplateFromProgrammerMutation()
  const selectedKeys = useSelector((s: Parameters<typeof selectTargetKeys>[0]) =>
    selectTargetKeys(s, 'programmer'),
  )

  const [name, setName] = useState('')
  const [family, setFamily] = useState<AttributeFamily | null>(null)

  const offered = useMemo(
    () => (families != null && families.length > 0 ? families : [...ATTRIBUTE_FAMILIES]),
    [families],
  )

  useEffect(() => {
    if (!open) return
    setName('')
    // Pre-chosen when the selection names exactly one — the common case, and the one the strip's
    // whole "the selection is the filter" idea rests on.
    setFamily(offered.length === 1 ? offered[0] : null)
    reset()
  }, [open, offered, reset])

  const targets = useMemo(
    () => selectedKeys.map((key) => ({ type: 'fixture' as const, key })),
    [selectedKeys],
  )
  const canSubmit = name.trim() !== '' && family != null && targets.length > 0 && !isLoading

  const submit = async () => {
    if (family == null) return
    try {
      const result = await record({
        projectId,
        name: name.trim(),
        mask: [family],
        targets,
      }).unwrap()
      // The shape it came out as is worth saying: an operator who meant "one amber" and got a
      // per-fixture template has selected heads that disagree, and will want to know now rather
      // than when they apply it somewhere else.
      toast.success(
        result.isGeneric
          ? `“${result.template.name}” — one value for any head`
          : `“${result.template.name}” — per fixture, ${result.template.rows.length} heads`,
      )
      onOpenChange(false)
    } catch {
      // Rendered inline below; `formatError` handles the shape.
    }
  }

  return (
    // `unsavedChanges` on the Sheet, **not** `useUnsavedChanges` here: that hook reads a context
    // `Sheet` itself provides, so calling it in the component that renders the `<Sheet>` looks up
    // the tree past the provider, finds nothing and silently no-ops (`register?.()`). The hook is
    // for a body component mounted *inside* `SheetContent`.
    <Sheet open={open} onOpenChange={onOpenChange} unsavedChanges={name.trim() !== ''}>
      <SheetContent className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>New template from selection</SheetTitle>
        </SheetHeader>
        <SheetBody>
          {error != null && (
            <Alert variant="destructive">
              <AlertDescription>{formatError(error)}</AlertDescription>
            </Alert>
          )}

          <p className="text-[11px] text-muted-foreground">
            Keeps what {targets.length} selected fixture{targets.length === 1 ? '' : 's'}{' '}
            {targets.length === 1 ? 'is' : 'are'} holding now. If they all agree it becomes one value
            for any head; if they differ it is kept per fixture, which is what a focus position is.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="new-template-name">Name</Label>
            <Input
              id="new-template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Amber Key"
              autoFocus
            />
          </div>

          {offered.length > 1 && (
            <div className="space-y-1.5">
              <Label>Attribute family — one only</Label>
              <div className="flex flex-wrap gap-1.5">
                {offered.map((f) => (
                  <Button
                    key={f}
                    type="button"
                    size="sm"
                    variant={family === f ? 'default' : 'outline'}
                    onClick={() => setFamily(f)}
                  >
                    {FAMILY_LABELS[f].singular}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Your selection covers more than one, and a template holds exactly one.
              </p>
            </div>
          )}

          {targets.length === 0 && (
            <p className="text-[11px] text-destructive">
              Nothing selected — there is nothing to record.
            </p>
          )}
        </SheetBody>
        <SheetFooter className="flex-row justify-end gap-2">
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
          <Button onClick={submit} disabled={!canSubmit}>
            {isLoading && <Loader2 className="size-4 animate-spin" />}
            Create template
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
