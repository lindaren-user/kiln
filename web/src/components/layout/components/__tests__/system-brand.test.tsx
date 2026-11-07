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

import { SidebarProvider } from '@/components/ui/sidebar'
import { BRAND_WORDMARK } from '@/config/brand'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { DEFAULT_LOGO } from '@/lib/constants'

import { SystemBrand } from '../system-brand'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: (props: { children?: ReactNode }) => <a>{props.children}</a>,
  }
})

vi.mock('@/hooks/use-status', () => ({ useStatus: vi.fn() }))
vi.mock('@/hooks/use-system-config', () => ({ useSystemConfig: vi.fn() }))
vi.mock('@/context/theme-provider', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))

const useStatusMock = vi.mocked(useStatus)
const useSystemConfigMock = vi.mocked(useSystemConfig)

// The header is rendered in the default light theme here, so only the black
// glyph is expected.
const WORDMARK_SOURCES = [BRAND_WORDMARK.onLight]

function imageSources(container: HTMLElement) {
  return [...container.querySelectorAll('img')].map((image) =>
    image.getAttribute('src')
  )
}

beforeEach(() => {
  useStatusMock.mockReturnValue({
    status: { system_name: 'New API' },
  } as ReturnType<typeof useStatus>)
  // The logo backend option is empty in this deployment, so `useSystemConfig`
  // hands back the bundled default.
  useSystemConfigMock.mockReturnValue({
    logo: DEFAULT_LOGO,
  } as ReturnType<typeof useSystemConfig>)
})

describe('SystemBrand', () => {
  it('shows the wordmark instead of the default logo and name', () => {
    const { container } = render(<SystemBrand variant='inline' />)

    expect(imageSources(container)).toEqual(WORDMARK_SOURCES)
    expect(screen.queryByText('New API')).toBeNull()
  })

  it('shows the wordmark in the sidebar variant too', () => {
    const { container } = render(
      <SidebarProvider>
        <SystemBrand variant='sidebar' />
      </SidebarProvider>
    )

    expect(imageSources(container)).toEqual(WORDMARK_SOURCES)
    expect(screen.queryByText('New API')).toBeNull()
  })

  it('shows the wordmark for the configured Kiln logo', () => {
    useSystemConfigMock.mockReturnValue({
      logo: '/kiln-logo.webp',
    } as ReturnType<typeof useSystemConfig>)

    const { container } = render(<SystemBrand variant='inline' />)

    expect(imageSources(container)).toEqual(WORDMARK_SOURCES)
  })

  it('keeps the square logo and system name for a custom logo', () => {
    useSystemConfigMock.mockReturnValue({
      logo: '/uploads/custom-logo.png',
    } as ReturnType<typeof useSystemConfig>)

    const { container } = render(<SystemBrand variant='inline' />)

    expect(imageSources(container)).toEqual(['/uploads/custom-logo.png'])
    expect(screen.getByText('New API')).toBeVisible()
  })
})
