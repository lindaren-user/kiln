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

import { resolveVideoURL } from '../api'

const TOKEN_URL = 'http://localhost:3000/v1/videos/task-1/content'
const CAPABILITY_URL =
  'http://localhost:3000/v1/tasks/task-1/artifacts/video/content?access=abc'

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('video URL resolution', () => {
  // The task's own address answers only a request that carries the API key,
  // which a <video> element and a download cannot send.
  it('prefers the artifact capability URL over the task result URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ artifacts: [{ key: 'video', type: 'video', content_url: CAPABILITY_URL }] })
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      resolveVideoURL({ apiKey: 'sk-1', taskId: 'task-1', resultUrl: TOKEN_URL })
    ).resolves.toBe(CAPABILITY_URL)
    expect(fetchMock).toHaveBeenCalledWith(
      '/v1/tasks/task-1/artifacts',
      expect.objectContaining({
        headers: { Authorization: 'Bearer sk-1' },
      })
    )
  })

  // A vendor address is already playable, and the gateway has no artifacts for
  // such a task, so asking for them would only delay the result.
  it('returns a vendor URL without asking for artifacts', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      resolveVideoURL({
        apiKey: 'sk-1',
        taskId: 'task-1',
        resultUrl: 'https://cdn.example.com/one.mp4',
      })
    ).resolves.toBe('https://cdn.example.com/one.mp4')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('asks for artifacts when the task reported no URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          artifacts: [{ key: 'video', type: 'video', content_url: CAPABILITY_URL }],
        })
      )
    )

    await expect(
      resolveVideoURL({ apiKey: 'sk-1', taskId: 'task-1', resultUrl: '' })
    ).resolves.toBe(CAPABILITY_URL)
  })

  it('keeps the result URL when the task has no video artifact', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ artifacts: [] }))
    )

    await expect(
      resolveVideoURL({ apiKey: 'sk-1', taskId: 'task-1', resultUrl: TOKEN_URL })
    ).resolves.toBe(TOKEN_URL)
  })

  it('keeps the result URL when the artifact request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    )

    await expect(
      resolveVideoURL({ apiKey: 'sk-1', taskId: 'task-1', resultUrl: TOKEN_URL })
    ).resolves.toBe(TOKEN_URL)
  })
})
