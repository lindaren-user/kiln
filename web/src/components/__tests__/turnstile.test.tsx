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
import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useTheme } from '@/context/theme-provider'
import { ensureTurnstile } from '@/lib/turnstile'

import { Turnstile } from '../turnstile'

vi.mock('@/context/theme-provider', () => ({ useTheme: vi.fn() }))
vi.mock('@/lib/turnstile', () => ({ ensureTurnstile: vi.fn() }))

const useThemeMock = vi.mocked(useTheme)
const ensureTurnstileMock = vi.mocked(ensureTurnstile)
const renderMock = vi.fn(
  (_element: HTMLElement, _options: Record<string, unknown>) => 'widget-1'
)
const removeMock = vi.fn()
const noop = () => undefined

beforeEach(() => {
  useThemeMock.mockReturnValue({
    resolvedTheme: 'light',
  } as ReturnType<typeof useTheme>)
  ensureTurnstileMock.mockResolvedValue({
    render: renderMock,
    remove: removeMock,
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Turnstile', () => {
  it('fills the form column and follows the light theme', async () => {
    render(<Turnstile siteKey='site-key' onVerify={noop} />)

    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1))
    expect(renderMock.mock.calls[0]?.[1]).toMatchObject({
      sitekey: 'site-key',
      size: 'flexible',
      theme: 'light',
    })
  })

  it('switches the widget to the dark theme with the app theme', async () => {
    useThemeMock.mockReturnValue({
      resolvedTheme: 'dark',
    } as ReturnType<typeof useTheme>)

    render(<Turnstile siteKey='site-key' onVerify={noop} />)

    await waitFor(() =>
      expect(renderMock.mock.calls[0]?.[1]).toMatchObject({ theme: 'dark' })
    )
  })

  it('does not touch the loader until there is a site key', async () => {
    const { rerender } = render(<Turnstile siteKey='' onVerify={noop} />)
    expect(ensureTurnstileMock).not.toHaveBeenCalled()

    rerender(<Turnstile siteKey='site-key' onVerify={noop} />)

    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1))
  })

  it('removes the widget when the form unmounts', async () => {
    const { unmount } = render(<Turnstile siteKey='site-key' onVerify={noop} />)
    await waitFor(() => expect(renderMock).toHaveBeenCalled())

    unmount()

    expect(removeMock).toHaveBeenCalledWith('widget-1')
  })

  it('stays silent when the script never loads', async () => {
    ensureTurnstileMock.mockRejectedValue(new Error('Turnstile failed to load'))

    render(<Turnstile siteKey='site-key' onVerify={noop} />)

    await waitFor(() => expect(ensureTurnstileMock).toHaveBeenCalled())
    expect(renderMock).not.toHaveBeenCalled()
  })
})
