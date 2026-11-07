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
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchTokenKey, getApiKeys } from '@/features/keys/api'
import type { ApiKey } from '@/features/keys/types'

import { generateImages, listEnabledApiKeys, resolveApiKey } from '../api'

vi.mock('@/features/keys/api', () => ({
  getApiKeys: vi.fn(),
  fetchTokenKey: vi.fn(),
}))

const getApiKeysMock = vi.mocked(getApiKeys)
const fetchTokenKeyMock = vi.mocked(fetchTokenKey)

function apiKey(overrides: Partial<ApiKey>): ApiKey {
  return {
    id: 1,
    name: 'Canvas',
    key: 'abc**********xyz',
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
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('listEnabledApiKeys', () => {
  it('drops disabled keys from the canvas picker', async () => {
    getApiKeysMock.mockResolvedValue({
      success: true,
      data: {
        items: [
          apiKey({ id: 1, name: 'enabled' }),
          apiKey({ id: 2, name: 'disabled', status: 2 }),
        ],
        total: 2,
        page: 1,
        page_size: 100,
      },
    })

    await expect(listEnabledApiKeys()).resolves.toMatchObject([{ id: 1 }])
  })
})

describe('resolveApiKey', () => {
  it('turns the masked list entry into the full sk- credential', async () => {
    fetchTokenKeyMock.mockResolvedValue({
      success: true,
      data: { key: 'abc123' },
    })

    await expect(resolveApiKey(7)).resolves.toBe('sk-abc123')
    expect(fetchTokenKeyMock).toHaveBeenCalledWith(7)
  })

  it('surfaces the server message when the secret cannot be read', async () => {
    fetchTokenKeyMock.mockResolvedValue({
      success: false,
      message: 'forbidden',
    })

    await expect(resolveApiKey(7)).rejects.toThrow('forbidden')
  })
})

describe('generateImages', () => {
  it('sends the request with the sk- key and returns urls and inline images', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ url: 'https://cdn.example.com/one.png' }, { b64_json: 'AAA' }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      generateImages({
        apiKey: 'sk-abc123',
        model: 'z-image',
        prompt: 'a kiln at dusk',
        size: '1024x1024',
        count: 2,
      })
    ).resolves.toEqual([
      'https://cdn.example.com/one.png',
      'data:image/png;base64,AAA',
    ])

    expect(fetchMock).toHaveBeenCalledWith(
      '/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-abc123',
        }),
      })
    )
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as { body: string }).body
    )
    expect(body).toMatchObject({
      model: 'z-image',
      prompt: 'a kiln at dusk',
      n: 2,
      size: '1024x1024',
    })
  })

  it('surfaces the server error message when generation fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: 'quota exceeded' } }),
      })
    )

    await expect(
      generateImages({
        apiKey: 'sk-abc123',
        model: 'z-image',
        prompt: 'a kiln at dusk',
        size: '1024x1024',
        count: 1,
      })
    ).rejects.toThrow('quota exceeded')
  })

  it('rejects a successful response that carries no images', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      })
    )

    await expect(
      generateImages({
        apiKey: 'sk-abc123',
        model: 'z-image',
        prompt: 'a kiln at dusk',
        size: '1024x1024',
        count: 1,
      })
    ).rejects.toThrow('The model returned no images')
  })
})
