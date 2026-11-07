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

import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'

import { Footer } from '../footer'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: (props: { children?: ReactNode; to?: string }) => (
      <a href={props.to}>{props.children}</a>
    ),
  }
})

vi.mock('@/hooks/use-status', () => ({ useStatus: vi.fn() }))
vi.mock('@/hooks/use-system-config', () => ({ useSystemConfig: vi.fn() }))

const useStatusMock = vi.mocked(useStatus)
const useSystemConfigMock = vi.mocked(useSystemConfig)

beforeEach(() => {
  useStatusMock.mockReturnValue({
    status: {},
  } as ReturnType<typeof useStatus>)
  useSystemConfigMock.mockReturnValue({
    systemName: 'Kiln',
    logo: '/kiln-logo.webp',
    footerHtml: '',
  } as ReturnType<typeof useSystemConfig>)
})

describe('Footer', () => {
  it('does not show a logo or a brand-name link', () => {
    const { container } = render(<Footer />)

    expect(container.querySelector('img')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Kiln' })).toBeNull()
  })
})
