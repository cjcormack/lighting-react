// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Store-connected; the menu *contents* are Radix dropdown children that need pointer-event
// polyfills in jsdom, so these tests deliberately stay on the always-rendered trigger — which
// is where the avatar initials live. The factory is hoisted above everything else in this file.
let statusResult: { data?: { setupRequired: boolean; authenticated: boolean; user?: unknown } } = {}

vi.mock('@/store/auth', () => ({
  useAuthStatusQuery: () => statusResult,
  useLogoutMutation: () => [() => ({ unwrap: () => Promise.resolve() }), { isLoading: false }],
  // ProfileSheet is mounted alongside the trigger, so its hooks have to exist too.
  useChangePasswordMutation: () => [() => ({ unwrap: () => Promise.resolve() }), { isLoading: false }],
  useUpdateProfileMutation: () => [() => ({ unwrap: () => Promise.resolve() }), { isLoading: false }],
  useRevokeOtherSessionsMutation: () => [() => ({ unwrap: () => Promise.resolve() }), { isLoading: false }],
  useSessionsQuery: () => ({ data: [] }),
  useCreateDeviceLoginMutation: () => [() => ({ unwrap: () => Promise.resolve() }), { isLoading: false }],
  useCancelDeviceLoginMutation: () => [() => ({ unwrap: () => Promise.resolve() }), { isLoading: false }],
  useDeviceLoginStatusQuery: () => ({}),
}))

import { UserMenu } from './UserMenu'

function signedInAs(displayName: string) {
  statusResult = {
    data: {
      setupRequired: false,
      authenticated: true,
      user: { uuid: 'u-1', username: 'admin', displayName, role: 'ADMIN' },
    },
  }
}

afterEach(() => {
  cleanup()
  statusResult = {}
})

describe('UserMenu', () => {
  it('renders nothing on a bootstrap-open desk', () => {
    // No users exist yet, so there is no identity to show; the setup screen asks for one.
    statusResult = { data: { setupRequired: true, authenticated: false } }
    const { container } = render(<UserMenu />)
    expect(container).toBeEmptyDOMElement()
  })

  describe('the avatar initials', () => {
    const initials = (displayName: string) => {
      signedInAs(displayName)
      render(<UserMenu />)
      return screen.getByRole('button', { name: `Signed in as ${displayName}` }).textContent
    }

    it('takes the first and last word', () => {
      expect(initials('Chris Cormack')).toBe('CC')
    })

    it('skips a parenthesised qualifier rather than showing punctuation', () => {
      // "Chris C (desk)" — a desk, room or role in brackets is the commonest shape here, and
      // taking the first character of the last word blindly rendered "C(".
      expect(initials('Chris C (desk)')).toBe('CC')
    })

    it('uses two letters when there is only one word', () => {
      expect(initials('Cher')).toBe('CH')
    })

    it('falls back to a question mark when no word starts with a letter or digit', () => {
      expect(initials('!!! ???')).toBe('?')
    })
  })
})
