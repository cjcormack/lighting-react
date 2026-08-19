// @vitest-environment jsdom
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, useUnsavedChanges } from './sheet'

/**
 * Escape closes a sheet, except while the Kotlin editor's completion popup is open — that popup
 * is a bare element on `<body>`, so without this guard dismissing it also threw away whatever was
 * being edited in the sheet behind it. Radix reads Escape in the capture phase, which is what
 * makes a DOM check inside the handler reliable rather than a race with CodeMirror's own close.
 */
function TestSheet() {
  const [open, setOpen] = useState(true)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit</SheetTitle>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  )
}

/** A sheet body that reports its own dirty state, the way a form component does. */
function DirtyBody({ unsaved }: { unsaved: boolean }) {
  useUnsavedChanges(unsaved)
  return <p>body</p>
}

function GuardedSheet({ unsaved }: { unsaved: boolean }) {
  const [open, setOpen] = useState(true)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit</SheetTitle>
        </SheetHeader>
        <DirtyBody unsaved={unsaved} />
        <SheetClose asChild>
          <button type="button">Cancel</button>
        </SheetClose>
      </SheetContent>
    </Sheet>
  )
}

describe('SheetContent', () => {
  it('closes on Escape', () => {
    render(<TestSheet />)
    expect(screen.getByText('Edit')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
  })

  it('stays open when Escape dismisses the completion popup instead', () => {
    render(<TestSheet />)
    // What CodeMirror appends while its hint list is showing.
    const hints = document.createElement('ul')
    hints.className = 'CodeMirror-hints'
    document.body.appendChild(hints)

    try {
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.getByText('Edit')).toBeInTheDocument()
    } finally {
      hints.remove()
    }

    // …and once the popup is gone, Escape closes the sheet as usual.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
  })

  it('asks before discarding when the body reports unsaved changes', () => {
    render(<GuardedSheet unsaved />)

    fireEvent.keyDown(document, { key: 'Escape' })

    // Still open, with the question in front of it.
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Discard changes?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByText('Edit')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
  })

  it('closes without asking when nothing is unsaved', () => {
    render(<GuardedSheet unsaved={false} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument()
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
  })

  it('asks when a Cancel wired through SheetClose is pressed', () => {
    // A Cancel calling the parent's own setOpen(false) closes the sheet without Radix knowing,
    // so it never reaches the guard. Wrapping it in SheetClose is what puts it back on that path.
    render(<GuardedSheet unsaved />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Discard changes?')).toBeInTheDocument()
  })
})
