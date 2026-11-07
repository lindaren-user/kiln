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
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BRAND_WORDMARK } from '@/config/brand'
import { useSystemConfig } from '@/hooks/use-system-config'
import { DEFAULT_LOGO } from '@/lib/constants'

import { AuthLayout } from '../auth-layout'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: (props: { children?: ReactNode }) => <a>{props.children}</a>,
  }
})

vi.mock('@/hooks/use-system-config', () => ({ useSystemConfig: vi.fn() }))
vi.mock('@/context/theme-provider', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))

const useSystemConfigMock = vi.mocked(useSystemConfig)

beforeEach(() => {
  useSystemConfigMock.mockReturnValue({
    systemName: 'New API',
    logo: DEFAULT_LOGO,
    loading: false,
  } as ReturnType<typeof useSystemConfig>)
})

describe('AuthLayout brand', () => {
  it('shows the bundled wordmark instead of the logo and system name', () => {
    const { container } = render(
      <AuthLayout>
        <div>form</div>
      </AuthLayout>
    )

    expect(
      [...container.querySelectorAll('img')].map((image) =>
        image.getAttribute('src')
      )
    ).toEqual([BRAND_WORDMARK.onLight])
    expect(screen.queryByText('New API')).toBeNull()
  })

  it('keeps the square logo and system name for a custom logo', () => {
    useSystemConfigMock.mockReturnValue({
      systemName: 'New API',
      logo: '/uploads/custom-logo.png',
      loading: false,
    } as ReturnType<typeof useSystemConfig>)

    const { container } = render(
      <AuthLayout>
        <div>form</div>
      </AuthLayout>
    )

    expect(
      [...container.querySelectorAll('img')].map((image) =>
        image.getAttribute('src')
      )
    ).toEqual(['/uploads/custom-logo.png'])
    expect(screen.getByText('New API')).toBeVisible()
  })
})
