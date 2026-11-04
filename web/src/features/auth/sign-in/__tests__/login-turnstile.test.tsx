/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

const loginMock = vi.fn()
const resetTurnstileMock = vi.fn()
const setTurnstileTokenMock = vi.fn()
const handleLoginResultMock = vi.fn()

let turnstileToken = 'fresh-turnstile-token'
let turnstileWidgetKey = 0

vi.mock('@/features/auth/api', () => ({
  login: (...args: unknown[]) => loginMock(...args),
  wechatLoginByCode: vi.fn(),
}))

vi.mock('@/features/auth/hooks/use-turnstile', () => ({
  useTurnstile: () => ({
    isTurnstileEnabled: true,
    turnstileSiteKey: 'test-site-key',
    get turnstileToken() {
      return turnstileToken
    },
    get turnstileWidgetKey() {
      return turnstileWidgetKey
    },
    setTurnstileToken: (token: string) => {
      turnstileToken = token
      setTurnstileTokenMock(token)
    },
    resetTurnstile: () => {
      turnstileToken = ''
      turnstileWidgetKey += 1
      resetTurnstileMock()
    },
    validateTurnstile: () => Boolean(turnstileToken),
  }),
}))

vi.mock('@/features/auth/hooks/use-auth-redirect', () => ({
  useAuthRedirect: () => ({
    handleLoginResult: (...args: unknown[]) => handleLoginResultMock(...args),
  }),
}))

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: {
      password_login_enabled: true,
      password_login_encryption_enabled: false,
      passkey_login: false,
      turnstile_check: true,
      turnstile_site_key: 'test-site-key',
    },
  }),
}))

vi.mock('@/components/turnstile', () => ({
  Turnstile: () => <div data-testid='turnstile-widget' />,
}))

vi.mock('@/features/auth/components/oauth-providers', () => ({
  OAuthProviders: () => null,
}))

vi.mock('@/features/auth/components/legal-consent', () => ({
  LegalConsent: () => null,
}))

vi.mock('@/lib/handle-server-error', () => ({
  handleServerError: vi.fn(),
}))

vi.mock('@tanstack/react-router', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-router')>(
      '@tanstack/react-router'
    )
  return {
    ...actual,
    Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  }
})

const i18n = createInstance()

beforeEach(async () => {
  turnstileToken = 'fresh-turnstile-token'
  turnstileWidgetKey = 0
  loginMock.mockReset()
  resetTurnstileMock.mockReset()
  setTurnstileTokenMock.mockReset()
  handleLoginResultMock.mockReset()
  handleLoginResultMock.mockResolvedValue(true)

  await i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: false,
    nsSeparator: false,
    resources: { en },
    interpolation: { escapeValue: false },
  })
})

describe('UserAuthForm Turnstile', () => {
  it('does not remount Turnstile when login is clicked, only after the request finishes', async () => {
    let resolveLogin!: (value: {
      success: boolean
      message: string
      data: null
    }) => void
    loginMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve
        })
    )

    const { UserAuthForm } = await import('../components/user-auth-form')
    const user = userEvent.setup()
    render(
      <I18nextProvider i18n={i18n}>
        <UserAuthForm />
      </I18nextProvider>
    )

    await user.type(
      screen.getByPlaceholderText('Enter your username or email'),
      'alice'
    )
    await user.type(
      screen.getByPlaceholderText('Enter password'),
      'secret-password'
    )
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(loginMock).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'alice',
        password: 'secret-password',
        turnstile: 'fresh-turnstile-token',
      })
    )
    expect(setTurnstileTokenMock).toHaveBeenCalledWith('')
    expect(resetTurnstileMock).not.toHaveBeenCalled()

    resolveLogin({ success: false, message: 'invalid credentials', data: null })

    await waitFor(() => {
      expect(resetTurnstileMock).toHaveBeenCalledTimes(1)
    })
  })
})
