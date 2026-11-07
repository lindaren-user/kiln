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
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BRAND_WORDMARK, getBrandWordmark } from '@/config/brand'
import { useTheme } from '@/context/theme-provider'
import { DEFAULT_LOGO } from '@/lib/constants'

import { BrandWordmarkImage } from '../brand-wordmark'

vi.mock('@/context/theme-provider', () => ({ useTheme: vi.fn() }))

const useThemeMock = vi.mocked(useTheme)

beforeEach(() => {
  useThemeMock.mockReturnValue({
    resolvedTheme: 'light',
  } as ReturnType<typeof useTheme>)
})

describe('getBrandWordmark', () => {
  it('resolves the bundled wordmark for the Kiln logo', () => {
    expect(getBrandWordmark('/kiln-logo.webp')).toBe(BRAND_WORDMARK)
  })

  it('falls back to the bundled wordmark while the logo option is unset', () => {
    expect(getBrandWordmark(DEFAULT_LOGO)).toBe(BRAND_WORDMARK)
    expect(getBrandWordmark('')).toBe(BRAND_WORDMARK)
    expect(getBrandWordmark(undefined)).toBe(BRAND_WORDMARK)
  })

  it('returns undefined for a custom logo', () => {
    expect(getBrandWordmark('/uploads/custom-logo.png')).toBeUndefined()
  })
})

describe('BrandWordmarkImage', () => {
  it('renders only the black glyph on a light theme', () => {
    const { container } = render(
      <BrandWordmarkImage wordmark={BRAND_WORDMARK} />
    )

    const images = [...container.querySelectorAll('img')]
    expect(images.map((image) => image.getAttribute('src'))).toEqual([
      '/kiln-wordmark-dark.webp',
    ])
    expect(images[0]?.getAttribute('aria-hidden')).toBe('true')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('renders only the amber glyph on a dark theme', () => {
    useThemeMock.mockReturnValue({
      resolvedTheme: 'dark',
    } as ReturnType<typeof useTheme>)

    const { container } = render(
      <BrandWordmarkImage wordmark={BRAND_WORDMARK} />
    )

    expect(
      [...container.querySelectorAll('img')].map((image) =>
        image.getAttribute('src')
      )
    ).toEqual(['/kiln-wordmark.webp'])
  })
})
