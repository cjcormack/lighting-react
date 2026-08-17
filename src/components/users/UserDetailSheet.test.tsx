// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The sheet is store-connected. Mocking the store module keeps this a component test and
// keeps the import graph away from lightingApi's real WebSocket, as ResetPasswordPage's test
// does. Every hook it reaches for gets a quiet stub — the point here is what renders for
// `isSelf`, not what any request returns.
// The factory is hoisted above everything else in this file, so it can't close over a helper
// declared here — hence the repetition.
vi.mock('@/store/users', () => {
  const mutation = () => [
    (args: unknown) => ({ unwrap: () => Promise.resolve(args) }),
    { isLoading: false },
  ]
  return {
    useUserQuery: () => ({ data: undefined }),
    useUpdateUserMutation: mutation,
    useDeleteUserMutation: mutation,
    useSetUserPasswordMutation: mutation,
    useCreateResetTokenMutation: mutation,
    useCancelResetTokenMutation: mutation,
    useResetTokenStatusQuery: () => ({ data: undefined }),
    useResetTokenHistoryQuery: () => ({ data: [], isLoading: false }),
  }
})

import { UserDetailSheet } from './UserDetailSheet'

const user = {
  id: 7,
  uuid: 'u-7',
  username: 'boss',
  displayName: 'The Boss',
  role: 'ADMIN' as const,
  disabled: false,
  createdAtMs: 0,
  lastLoginAtMs: null,
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderSheet(isSelf: boolean) {
  render(<UserDetailSheet user={user} open onOpenChange={() => {}} isSelf={isSelf} />)
}

describe('UserDetailSheet', () => {
  // FU-AUTH-SELF-RESET-GUARD and FU-AUTH-SELF-ROLE-GUARD. Both are enforced by the backend —
  // these assertions are about not offering an action that can only ever answer 409.
  describe('for your own account', () => {
    it('offers no way to reset or set your own password', () => {
      renderSheet(true)
      expect(screen.queryByRole('button', { name: /Reset with a QR code/ })).not.toBeInTheDocument()
      // Absent, not merely disabled: a QR here would put a link that re-passwords an admin
      // account on the desk's own screen, for anyone passing to photograph.
      expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
      expect(screen.getByText(/Change password…/)).toBeInTheDocument()
    })

    it('will not let you change your own role', () => {
      renderSheet(true)
      expect(screen.getByRole('combobox')).toBeDisabled()
      expect(screen.getByText(/another administrator has to do it/)).toBeInTheDocument()
    })
  })

  describe('for somebody else', () => {
    it('offers both password routes and an editable role', () => {
      renderSheet(false)
      expect(screen.getByRole('button', { name: /Reset with a QR code/ })).toBeInTheDocument()
      expect(screen.getByLabelText('New password')).toBeInTheDocument()
      expect(screen.getByRole('combobox')).not.toBeDisabled()
    })
  })
})
