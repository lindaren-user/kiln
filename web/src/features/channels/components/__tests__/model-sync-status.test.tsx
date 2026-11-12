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
import { expect, test } from 'vitest'

import { ModelSyncStatus } from '../model-sync-status'

test('nothing is shown before the first check or after the settings change', () => {
  const { container, rerender } = render(<ModelSyncStatus status='idle' />)
  expect(container).toBeEmptyDOMElement()

  rerender(<ModelSyncStatus status='stale' />)
  expect(container).toBeEmptyDOMElement()
})

test('a synced list says where it came from', () => {
  render(
    <ModelSyncStatus
      status='success'
      sync={{ supported: true, synced: true }}
    />
  )

  expect(
    screen.getByText("Synced with this channel's latest model list.")
  ).toBeVisible()
})

test('a channel without a model list interface says so', () => {
  render(
    <ModelSyncStatus
      status='success'
      sync={{ supported: false, synced: false }}
    />
  )

  expect(
    screen.getByText(
      'This channel provides no model list interface; its models are maintained manually.'
    )
  ).toBeVisible()
})

test('a failed check reports the reason instead of claiming a sync', () => {
  render(
    <ModelSyncStatus
      status='success'
      sync={{
        supported: true,
        synced: false,
        message: 'model list request returned status 401',
      }}
    />
  )

  expect(
    screen.getByText(
      'Model list sync failed: model list request returned status 401'
    )
  ).toBeVisible()
})

test('the legend explains the normal, red and yellow chips', () => {
  render(
    <ModelSyncStatus
      status='success'
      sync={{ supported: true, synced: true }}
      missing={['old-video-model']}
      added={['brand-new-model']}
    />
  )

  expect(
    screen.getByText('Default: still provided by the upstream')
  ).toBeVisible()
  expect(
    screen.getByText('Red: no longer provided by the upstream')
  ).toBeVisible()
  expect(
    screen.getByText('Yellow: newly provided upstream; click to add')
  ).toBeVisible()
})

test('the legend is omitted when the channel matches the upstream', () => {
  render(
    <ModelSyncStatus
      status='success'
      sync={{ supported: true, synced: true }}
    />
  )

  expect(
    screen.queryByText('Default: still provided by the upstream')
  ).not.toBeInTheDocument()
})
