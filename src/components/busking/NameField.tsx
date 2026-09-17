import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

/**
 * A name on a document the operator is editing, committed when they leave the field rather than
 * per keystroke.
 *
 * Every gesture on the busk page and on the rig saves the **whole document**, so a per-keystroke
 * write would be one full PUT and one broadcast per character. A rename is a gesture that ends when
 * you stop typing, so it commits on blur and on Enter; Escape puts the stored name back; and a blank
 * is reverted rather than sent, because both servers refuse one (`BUSK_LAYOUT_INVALID`,
 * `BUSK_RIG_INVALID`) and the field putting the stored name back is a better answer than a toast
 * after the optimistic patch rolled back.
 *
 * It was `BankNameField`, private to `BuskBank.tsx`, until the rig's rows needed the same field.
 */
export function NameField({
  value,
  label,
  placeholder,
  onSave,
  className,
}: {
  value: string
  /** The `aria-label`: `Bank name`, `Row name`. */
  label: string
  placeholder: string
  /** Called with a non-blank name that differs from [value]. */
  onSave: (name: string) => void
  className?: string
}) {
  const [draft, setDraft] = useState(value)

  // Another client, or an undone save, can move the stored name under us.
  useEffect(() => setDraft(value), [value])

  function save() {
    if (draft.trim() === '') {
      setDraft(value)
      return
    }
    if (draft === value) return
    onSave(draft)
  }

  return (
    <Input
      value={draft}
      aria-label={label}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(value)
          e.currentTarget.blur()
        }
      }}
      className={cn('h-7 text-[13px]', className)}
    />
  )
}
