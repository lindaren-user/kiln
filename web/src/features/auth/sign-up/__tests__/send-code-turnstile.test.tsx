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

const sendEmailVerificationMock = vi.fn()
const resetTurnstileMock = vi.fn()
const setTurnstileTokenMock = vi.fn()

let turnstileToken = 'fresh-turnstile-token'
let turnstileWidgetKey = 0

vi.mock('@/features/auth/api', () => ({
  register: vi.fn(),
  sendEmailVerification: (...args: unknown[]) =>
    sendEmailVerificationMock(...args),
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
    redirectToLogin: vi.fn(),
    handleLoginResult: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: {
      email_verification: true,
      turnstile_check: true,
      turnstile_site_key: 'test-site-key',
      oauth_register_enabled: false,
      wechat_login: false,
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

const i18n = createInstance()

beforeEach(async () => {
  turnstileToken = 'fresh-turnstile-token'
  turnstileWidgetKey = 0
  sendEmailVerificationMock.mockReset()
  resetTurnstileMock.mockReset()
  setTurnstileTokenMock.mockReset()
  sendEmailVerificationMock.mockResolvedValue({ success: true })

  await i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: false,
    nsSeparator: false,
    resources: { en },
    interpolation: { escapeValue: false },
  })
})

describe('SignUpForm send-code Turnstile', () => {
  it('does not remount Turnstile after a successful verification email send', async () => {
    const { SignUpForm } = await import('../components/sign-up-form')
    const user = userEvent.setup()

    render(
      <I18nextProvider i18n={i18n}>
        <SignUpForm />
      </I18nextProvider>
    )

    await user.type(
      screen.getByPlaceholderText('name@example.com'),
      'alice@example.com'
    )
    await user.click(screen.getByRole('button', { name: 'Send code' }))

    await waitFor(() => {
      expect(sendEmailVerificationMock).toHaveBeenCalledWith(
        'alice@example.com',
        'fresh-turnstile-token'
      )
    })
    expect(setTurnstileTokenMock).toHaveBeenCalledWith('')
    expect(resetTurnstileMock).not.toHaveBeenCalled()
  })
})
