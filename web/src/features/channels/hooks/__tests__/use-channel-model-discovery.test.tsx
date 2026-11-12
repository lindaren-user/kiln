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
import { act, renderHook } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { fetchUpstreamModels } from '../../api'
import { useChannelModelDiscovery } from '../use-channel-model-discovery'

vi.mock('../../api', () => ({
  fetchModels: vi.fn(),
  fetchUpstreamModels: vi.fn(),
}))

test('the sync report travels with the fetched models', async () => {
  const sync = {
    supported: true,
    synced: true,
    source: 'upstream' as const,
  }
  vi.mocked(fetchUpstreamModels).mockResolvedValue({
    success: true,
    data: ['live-model'],
    sync,
  })

  // The request reference must stay stable across renders: a fresh object each
  // render would retrigger the hook's invalidation effect forever.
  const request = { kind: 'saved' as const, channelId: 7 }
  const { result } = renderHook(() =>
    useChannelModelDiscovery({ enabled: true, request })
  )

  await act(async () => {
    await result.current.fetch()
  })

  expect(result.current.status).toBe('success')
  expect(result.current.models).toEqual(['live-model'])
  expect(result.current.sync).toEqual(sync)
})
