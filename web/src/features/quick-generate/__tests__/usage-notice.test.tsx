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
import { beforeEach, describe, expect, it } from 'vitest'

import { UsageNotice } from '../components/usage-notice'

const STORAGE_KEY = 'kiln:quick-generate:notice-collapsed:v1'
const SUMMARY =
  'For testing only. Using this as a workbench is not recommended.'
const IMAGE_CAVEAT =
  'Images are not saved: an image still generating is lost when you leave or reload this page. Download what you want to keep first.'

beforeEach(() => {
  window.localStorage.clear()
})

describe('quick generate usage notice', () => {
  it('lists every caveat under the summary when nothing is stored', () => {
    render(<UsageNotice />)

    expect(screen.getByText(SUMMARY)).toBeInTheDocument()
    const caveat = screen.getByText(IMAGE_CAVEAT)
    expect(caveat).toBeInTheDocument()
    // The panel height slides; a panel that merely mounts would reflow the
    // result area below in one frame. The class carries the keyframes and
    // Base UI exposes `data-open` to select them.
    const panel = caveat.closest('[data-slot="collapsible-content"]')
    expect(panel).toHaveClass('CollapsibleContent')
    expect(panel).toHaveAttribute('data-open')
    expect(
      screen.getByRole('button', { name: new RegExp(SUMMARY) })
    ).toHaveAttribute('aria-expanded', 'true')
  })

  it('hides the caveats and stores the choice when the notice is collapsed', () => {
    render(<UsageNotice />)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(SUMMARY) }))

    expect(screen.queryByText(IMAGE_CAVEAT)).not.toBeInTheDocument()
    expect(screen.getByText(SUMMARY)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: new RegExp(SUMMARY) })
    ).toHaveAttribute('aria-expanded', 'false')
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')).toBe(
      true
    )
  })

  it('starts collapsed when the stored choice says so', () => {
    window.localStorage.setItem(STORAGE_KEY, 'true')

    render(<UsageNotice />)

    expect(screen.getByText(SUMMARY)).toBeInTheDocument()
    expect(screen.queryByText(IMAGE_CAVEAT)).not.toBeInTheDocument()
  })

  it('expands again and stores that the caveats are shown', () => {
    window.localStorage.setItem(STORAGE_KEY, 'true')
    render(<UsageNotice />)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(SUMMARY) }))

    expect(screen.getByText(IMAGE_CAVEAT)).toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')).toBe(
      false
    )
  })
})
