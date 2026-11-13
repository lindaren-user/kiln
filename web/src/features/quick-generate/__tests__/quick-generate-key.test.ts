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
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  listEnabledApiKeys,
  resolveApiKey,
} from '@/features/image-generation/api'
import { createApiKey } from '@/features/keys/api'
import type { ApiKey } from '@/features/keys/types'

import { resolveQuickGenerateKey } from '../lib/quick-generate-key'

vi.mock('@/features/image-generation/api', () => ({
  listEnabledApiKeys: vi.fn(),
  resolveApiKey: vi.fn(),
}))

vi.mock('@/features/keys/api', () => ({
  createApiKey: vi.fn(),
}))

const listEnabledApiKeysMock = vi.mocked(listEnabledApiKeys)
const resolveApiKeyMock = vi.mocked(resolveApiKey)
const createApiKeyMock = vi.mocked(createApiKey)

function apiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 7,
    name: '快速生成',
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

beforeEach(() => {
  resolveApiKeyMock.mockResolvedValue('sk-quick')
})

describe('quick generate key', () => {
  it('reuses the key it created on an earlier run', async () => {
    listEnabledApiKeysMock.mockResolvedValue([apiKey(), apiKey({ id: 9 })])

    await expect(resolveQuickGenerateKey()).resolves.toEqual({
      id: 7,
      apiKey: 'sk-quick',
    })
    expect(createApiKeyMock).not.toHaveBeenCalled()
    expect(resolveApiKeyMock).toHaveBeenCalledWith(7)
  })

  it('creates the key on first use', async () => {
    listEnabledApiKeysMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([apiKey({ id: 12, name: '快速生成' })])
    createApiKeyMock.mockResolvedValue({ success: true })

    await expect(resolveQuickGenerateKey()).resolves.toEqual({
      id: 12,
      apiKey: 'sk-quick',
    })
    expect(createApiKeyMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: '快速生成', unlimited_quota: true })
    )
  })

  it('ignores another key the user made', async () => {
    listEnabledApiKeysMock
      .mockResolvedValueOnce([apiKey({ id: 3, name: 'mine' })])
      .mockResolvedValueOnce([
        apiKey({ id: 3, name: 'mine' }),
        apiKey({ id: 4 }),
      ])
    createApiKeyMock.mockResolvedValue({ success: true })

    await expect(resolveQuickGenerateKey()).resolves.toEqual({
      id: 4,
      apiKey: 'sk-quick',
    })
  })

  it('reports a key that could not be created', async () => {
    listEnabledApiKeysMock.mockResolvedValue([])
    createApiKeyMock.mockResolvedValue({ success: false, message: 'denied' })

    await expect(resolveQuickGenerateKey()).rejects.toThrow('denied')
  })
})
