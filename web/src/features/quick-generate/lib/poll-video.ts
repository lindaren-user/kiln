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
import { t } from 'i18next'

import { fetchVideoTask } from '../api'

export const VIDEO_POLL_INTERVAL_MS = 3000
export const VIDEO_POLL_TIMEOUT_MS = 10 * 60 * 1000

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

type PollVideoTaskOptions = {
  apiKey: string
  taskId: string
  /** True once the user started another generation or left the page. */
  isCancelled: () => boolean
  onProgress: (progress: string) => void
  intervalMs?: number
  timeoutMs?: number
}

/**
 * Poll a video task until it settles. Returns the result URL, or `null` when
 * the caller cancelled; failures and timeouts throw with a readable message.
 */
export async function pollVideoTask(
  options: PollVideoTaskOptions
): Promise<string | null> {
  const interval = options.intervalMs ?? VIDEO_POLL_INTERVAL_MS
  const deadline = Date.now() + (options.timeoutMs ?? VIDEO_POLL_TIMEOUT_MS)

  while (Date.now() < deadline) {
    await delay(interval)
    if (options.isCancelled()) return null

    const state = await fetchVideoTask({
      apiKey: options.apiKey,
      taskId: options.taskId,
    })
    if (options.isCancelled()) return null

    if (state.status === 'done') {
      if (!state.resultUrl) {
        throw new Error(t('The task finished without a video'))
      }
      return state.resultUrl
    }
    if (state.status === 'failed') {
      throw new Error(state.error || t('Video generation failed'))
    }
    options.onProgress(state.progress)
  }

  throw new Error(t('The video task is taking too long. Check it again later.'))
}
