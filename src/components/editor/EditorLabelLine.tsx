import { cn } from '@/lib/utils'
import { useEditorForm } from './EditorSurface'

/**
 * The popover's first line: what the edit lands on, and which column it is (editor-kit plan D8).
 *
 * *4 heads · Local* on the left — the batch and the scope, or the Look's name in layer scope, which
 * no editor said before — and the column on the right. It replaced *Applying to N targets*, which
 * was drawn only for a batch, said nothing about where the value would land, and left the popover
 * nameless: a popover has no header, so this is the one place its column is written.
 *
 * **Drawn in the popover form only.** Both sheet forms keep their title row — a Radix dialog needs
 * a title, and it already names the column — so a label line there would say the column twice and
 * the count where the band above the grid already says it. Read off the same shared media store
 * `EditorSurface` decides the form from, so the line and the surface cannot disagree; a
 * subscription per *open* editor, since this mounts inside the content and not per cell.
 */
export function EditorLabelLine({
  subject,
  column,
  className,
}: {
  subject: string
  column: string
  /** The line's own inset where the host's content is not padded — the two list editors. It goes
   *  with the line, so a sheet form draws no empty band where the line is not drawn. */
  className?: string
}) {
  const form = useEditorForm()
  if (form !== 'popover') return null
  return (
    <div
      data-editor-label-line
      className={cn('flex items-baseline justify-between gap-2 text-[10px] text-muted-foreground', className)}
    >
      <span className="min-w-0 truncate">{subject}</span>
      <span className="shrink-0">{column}</span>
    </div>
  )
}
