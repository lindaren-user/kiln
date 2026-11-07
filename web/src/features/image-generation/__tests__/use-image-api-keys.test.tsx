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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiKey } from '@/features/keys/types'

import { listEnabledApiKeys } from '../api'
import { useImageApiKeys } from '../hooks/use-image-api-keys'

vi.mock('../api', () => ({ listEnabledApiKeys: vi.fn() }))

const listEnabledApiKeysMock = vi.mocked(listEnabledApiKeys)

function apiKey(id: number, name: string): ApiKey {
  return {
    id,
    name,
    key: `sk-${id}**********`,
    status: 1,
    remain_quota: 0,
    used_quota: 0,
    unlimited_quota: true,
    expired_time: -1,
    created_time: 0,
    accessed_time: 0,
    group: '',
    auto_groups: null,
    cross_group_retry: false,
    model_limits_enabled: false,
    model_limits: '',
    allow_ips: '',
    allow_user_quota_query: false,
  }
}

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function createWrapper(client: QueryClient) {
  return function Wrapper(props: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        {props.children}
      </QueryClientProvider>
    )
  }
}

beforeEach(() => {
  listEnabledApiKeysMock.mockReset()
  window.localStorage.clear()
})

describe('generation API keys', () => {
  it('asks again on a later visit, so a newly created key appears', async () => {
    const client = createClient()
    listEnabledApiKeysMock.mockResolvedValueOnce([])

    const first = renderHook(() => useImageApiKeys(), {
      wrapper: createWrapper(client),
    })
    await waitFor(() => expect(first.result.current.isLoading).toBe(false))
    expect(first.result.current.keys).toEqual([])
    first.unmount()

    listEnabledApiKeysMock.mockResolvedValueOnce([apiKey(7, 'Quick key')])

    const second = renderHook(() => useImageApiKeys(), {
      wrapper: createWrapper(client),
    })

    await waitFor(() => expect(second.result.current.keys).toHaveLength(1))
    expect(second.result.current.selectedKeyId).toBe(7)
    expect(listEnabledApiKeysMock).toHaveBeenCalledTimes(2)
  })

  it('reports loading while the mount refetch of an empty list is in flight', async () => {
    const client = createClient()
    listEnabledApiKeysMock.mockResolvedValueOnce([])

    const first = renderHook(() => useImageApiKeys(), {
      wrapper: createWrapper(client),
    })
    await waitFor(() => expect(first.result.current.isLoading).toBe(false))
    first.unmount()

    let resolveRefetch: (keys: ApiKey[]) => void = () => {}
    listEnabledApiKeysMock.mockReturnValueOnce(
      new Promise<ApiKey[]>((resolve) => {
        resolveRefetch = resolve
      })
    )

    const second = renderHook(() => useImageApiKeys(), {
      wrapper: createWrapper(client),
    })

    expect(second.result.current.isLoading).toBe(true)
    await act(async () => {
      resolveRefetch([apiKey(7, 'Quick key')])
    })
    await waitFor(() => expect(second.result.current.isLoading).toBe(false))
    expect(second.result.current.keys).toHaveLength(1)
  })
})
