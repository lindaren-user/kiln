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
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ResultPanel } from '../components/result-panel'
import { capabilityFor } from '../lib/capabilities'
import type { Generation, GenerationKind } from '../types'

function running(kind: GenerationKind, overrides: Partial<Generation> = {}) {
  return {
    id: 'run-1',
    model: 'z-image',
    kind,
    capability: capabilityFor(kind),
    values: {},
    references: [],
    prompt: 'a kiln at dusk',
    status: 'running',
    media: [],
    saved: false,
    startedAt: Date.now(),
    ...overrides,
  } satisfies Generation
}

const panelProps = {
  runPrice: '',
  onZoom: vi.fn(),
  onDownload: vi.fn(),
  onRetry: vi.fn(),
}

afterEach(() => {
  vi.useRealTimers()
})

describe('result panel', () => {
  it('shows the elapsed time without a progress bar for an image', () => {
    vi.useFakeTimers()
    render(<ResultPanel generation={running('image')} {...panelProps} />)

    expect(screen.getByText('Generating... 0:00')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('starts the clock again when a new run replaces the running one', () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <ResultPanel generation={running('image')} {...panelProps} />
    )
    act(() => vi.advanceTimersByTime(3000))
    expect(screen.getByText('Generating... 0:03')).toBeInTheDocument()

    rerender(
      <ResultPanel
        generation={running('image', { id: 'run-2', startedAt: Date.now() })}
        {...panelProps}
      />
    )

    expect(screen.getByText('Generating... 0:00')).toBeInTheDocument()
  })

  it('resumes the clock from the start time a reload restored', () => {
    render(
      <ResultPanel
        generation={running('video', { startedAt: Date.now() - 65_000 })}
        {...panelProps}
      />
    )

    expect(screen.getByText('Generating... 1:05')).toBeInTheDocument()
  })

  it('starts the video bar again at 0% for a new run', () => {
    const { rerender } = render(
      <ResultPanel
        generation={running('video', { progress: '45%' })}
        {...panelProps}
      />
    )
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '45')

    rerender(
      <ResultPanel
        generation={running('video', { id: 'run-2', startedAt: Date.now() })}
        {...panelProps}
      />
    )

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })
})
