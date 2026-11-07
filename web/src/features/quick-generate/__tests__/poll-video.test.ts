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

import { fetchVideoTask, resolveVideoURL } from '../api'
import { pollVideoTask } from '../lib/poll-video'

vi.mock('../api', () => ({ fetchVideoTask: vi.fn(), resolveVideoURL: vi.fn() }))

const fetchVideoTaskMock = vi.mocked(fetchVideoTask)
const resolveVideoURLMock = vi.mocked(resolveVideoURL)

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
  // Most cases carry an upstream URL that needs no capability; the plugin
  // cases override this with the gateway's artifact address.
  resolveVideoURLMock.mockReset()
  resolveVideoURLMock.mockImplementation(async (params) => params.resultUrl)
})

function running(progress: string) {
  return { status: 'running' as const, progress, resultUrl: '', error: '' }
}

const DONE = {
  status: 'done' as const,
  progress: '100%',
  resultUrl: 'https://cdn.example.com/one.mp4',
  error: '',
}

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

  // A plugin task reports a gateway address that needs the API key; the
  // capability URL is what the browser can actually play and save.
  it('returns the artifact URL the browser can open for a plugin task', async () => {
    fetchVideoTaskMock.mockResolvedValue(DONE)
    resolveVideoURLMock.mockResolvedValue(
      'https://gateway.example/v1/tasks/task-1/artifacts/video/content?access=abc'
    )

    await expect(poll()).resolves.toBe(
      'https://gateway.example/v1/tasks/task-1/artifacts/video/content?access=abc'
    )
    expect(resolveVideoURLMock).toHaveBeenCalledWith({
      apiKey: 'sk-test',
      taskId: 'task-1',
      resultUrl: 'https://cdn.example.com/one.mp4',
    })
  })

  it('throws when a finished task has no URL at all', async () => {
    fetchVideoTaskMock.mockResolvedValue({ ...DONE, resultUrl: '' })

    await expect(poll()).rejects.toThrow('The task finished without a video')
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

  it('ignores a percentage lower than the one already shown', async () => {
    // Vendors recompute their estimate and can report less work than before,
    // which would make the bar jump backwards.
    fetchVideoTaskMock
      .mockResolvedValueOnce(running('45%'))
      .mockResolvedValueOnce(running('30%'))
      .mockResolvedValueOnce(DONE)
    const onProgress = vi.fn()

    await poll({ onProgress })

    expect(onProgress.mock.calls).toEqual([['45%']])
  })

  // The panel draws a string without a number as 0%, so forwarding it would
  // reset a bar that already sat at 45%.
  it('keeps the last percentage when the vendor falls back to a status word', async () => {
    fetchVideoTaskMock
      .mockResolvedValueOnce(running('45%'))
      .mockResolvedValueOnce(running('rendering'))
      .mockResolvedValueOnce(DONE)
    const onProgress = vi.fn()

    await poll({ onProgress })

    expect(onProgress.mock.calls).toEqual([['45%']])
  })

  // Before any percentage the word is the only information there is, so the
  // panel shows it beside the bar's 0%.
  it('shows a status word only until a percentage arrives', async () => {
    fetchVideoTaskMock
      .mockResolvedValueOnce(running('queued'))
      .mockResolvedValueOnce(running('45%'))
      .mockResolvedValueOnce(DONE)
    const onProgress = vi.fn()

    await poll({ onProgress })

    expect(onProgress.mock.calls).toEqual([['queued'], ['45%']])
  })

  it('keeps polling through a rate-limited fetch', async () => {
    // A 429 comes from a proxy or the gateway, not from the task: ending the
    // wait there would throw away a generation that is still running.
    fetchVideoTaskMock
      .mockRejectedValueOnce(Object.assign(new Error('Too many requests'), { status: 429 }))
      .mockResolvedValueOnce(DONE)

    await expect(poll()).resolves.toBe('https://cdn.example.com/one.mp4')
    expect(fetchVideoTaskMock).toHaveBeenCalledTimes(2)
  })

  it('stops at a failure that will not pass', async () => {
    fetchVideoTaskMock.mockRejectedValue(
      Object.assign(new Error('The key is not allowed'), { status: 401 })
    )

    await expect(poll()).rejects.toThrow('The key is not allowed')
    expect(fetchVideoTaskMock).toHaveBeenCalledTimes(1)
  })

  // An empty string says nothing; reporting it would clear whatever the panel
  // was showing.
  it('never reports an empty progress', async () => {
    fetchVideoTaskMock
      .mockResolvedValueOnce(running(''))
      .mockResolvedValueOnce(running('20%'))
      .mockResolvedValueOnce(DONE)
    const onProgress = vi.fn()

    await poll({ onProgress })

    expect(onProgress.mock.calls).toEqual([['20%']])
  })
})
