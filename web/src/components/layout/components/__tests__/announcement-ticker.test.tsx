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
import { fireEvent, render, screen } from '@testing-library/react'
import { useReducedMotion } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AnnouncementTicker } from '../announcement-ticker'

vi.mock('motion/react', () => ({ useReducedMotion: vi.fn() }))

const useReducedMotionMock = vi.mocked(useReducedMotion)

const TEXT = 'Scheduled maintenance tonight at 23:00'

beforeEach(() => {
  useReducedMotionMock.mockReturnValue(false)
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** jsdom reports zero widths; the loop repeats until one half fills the bar. */
function mockWidths(itemWidth: number, viewportWidth: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(
    itemWidth
  )
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(
    viewportWidth
  )
}

describe('announcement ticker', () => {
  it('renders nothing without text', () => {
    const { container } = render(<AnnouncementTicker text='' />)

    expect(container).toBeEmptyDOMElement()
  })

  it('repeats a short text until it fills the bar and scrolls it', () => {
    // One copy is 200px wide inside a 600px bar: three copies per half.
    mockWidths(200, 600)

    const { container } = render(<AnnouncementTicker text={TEXT} />)

    const track = container.querySelector('.announcement-ticker-track')
    expect(track).not.toBeNull()
    expect(track?.children).toHaveLength(6)
    expect(track?.children[0]).not.toHaveAttribute('aria-hidden')
    expect(track?.children[1]).toHaveAttribute('aria-hidden', 'true')
    expect(track).toHaveStyle({ animationDuration: '10s' })

    expect(
      screen.getByRole('button', { name: 'Pause announcements' })
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('duplicates a text wider than the bar and lets the reader pause it', () => {
    mockWidths(600, 300)

    const { container } = render(<AnnouncementTicker text={TEXT} />)

    const track = container.querySelector('.announcement-ticker-track')
    expect(track).not.toBeNull()
    expect(track?.children).toHaveLength(2)
    expect(track?.children[1]).toHaveAttribute('aria-hidden', 'true')
    expect(track).toHaveStyle({ animationDuration: '10s' })

    fireEvent.click(
      screen.getByRole('button', { name: 'Pause announcements' })
    )

    expect(
      screen.getByRole('button', { name: 'Resume announcements' })
    ).toHaveAttribute('aria-pressed', 'true')
    expect(track).toHaveStyle({ animationPlayState: 'paused' })
  })

  it('keeps the text static and scrollable when motion is reduced', () => {
    useReducedMotionMock.mockReturnValue(true)
    mockWidths(600, 300)

    const { container } = render(<AnnouncementTicker text={TEXT} />)

    expect(container.querySelector('.announcement-ticker-track')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(
      screen.getByRole('region', { name: 'Announcements' })
    ).toHaveTextContent(TEXT)
  })
})
