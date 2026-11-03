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

import { fetchVideoTask } from '../api'
import { pollVideoTask } from '../lib/poll-video'

vi.mock('../api', () => ({ fetchVideoTask: vi.fn() }))

const fetchVideoTaskMock = vi.mocked(fetchVideoTask)

function poll(overrides: Partial<Parameters<typeof pollVideoTask>[0]> = {}) {
  return pollVideoTask({
    apiKey: 'sk-test',
    taskId: 'task-1',
    isCancelled: () => false,
    onProgress: vi.fn(),
    intervalMs: 0,
    ...overrides,
  })
}

beforeEach(() => {
  fetchVideoTaskMock.mockReset()
})

describe('video polling', () => {
  it('returns the result URL once the task succeeds', async () => {
    fetchVideoTaskMock
      .mockResolvedValueOnce({
        status: 'running',
        progress: '40%',
        resultUrl: '',
        error: '',
      })
      .mockResolvedValueOnce({
        status: 'done',
        progress: '100%',
        resultUrl: 'https://cdn.example.com/one.mp4',
        error: '',
      })
    const onProgress = vi.fn()

    await expect(poll({ onProgress })).resolves.toBe(
      'https://cdn.example.com/one.mp4'
    )
    expect(onProgress).toHaveBeenCalledWith('40%')
  })

  it('throws the upstream reason when the task fails', async () => {
    fetchVideoTaskMock.mockResolvedValue({
      status: 'failed',
      progress: '',
      resultUrl: '',
      error: 'The prompt was rejected',
    })

    await expect(poll()).rejects.toThrow('The prompt was rejected')
  })

  it('stops without an error when the caller cancelled', async () => {
    await expect(poll({ isCancelled: () => true })).resolves.toBeNull()
    expect(fetchVideoTaskMock).not.toHaveBeenCalled()
  })
})
