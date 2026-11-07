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

import { fetchVideoTask, type VideoTaskState } from '../api'

export const VIDEO_POLL_INTERVAL_MS = 3000

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
  /**
   * Called only when the progress string says something new: a percentage the
   * task has not reached before, or a status word while it has none yet. It
   * never moves the bar backwards, so it can be written straight into state.
   */
  onProgress: (progress: string) => void
  /**
   * Progress a resumed task already showed. Percentages at or below it are
   * not reported, so reattaching to a task never moves the bar backwards.
   */
  startProgress?: string
  intervalMs?: number
}

/**
 * Percent a provider progress string reports, such as `45%` or `0.45`, or null
 * when it carries no number and is a status word instead.
 */
export function progressPercent(progress?: string): number | null {
  const value = Number.parseFloat(progress ?? '')
  return Number.isFinite(value) ? value : null
}

/** A failure that says nothing about the task: a blip, a 429, or a 5xx. */
function isTransientFailure(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status
  return status === undefined || status === 429 || Number(status) >= 500
}

/**
 * Poll a video task until it settles; there is no deadline, so a long task is
 * waited out rather than turned into an error. Transient fetch failures are
 * waited out too. Returns the result URL, or `null` when the caller cancelled;
 * a failed task throws with its reason.
 */
export async function pollVideoTask(
  options: PollVideoTaskOptions
): Promise<string | null> {
  const interval = options.intervalMs ?? VIDEO_POLL_INTERVAL_MS
  // Consecutive transient failures slow the poll down, so a rate-limited
  // client stops adding load while it waits for the limit to pass.
  let wait = interval
  // Vendors can report a lower percentage on a later poll, or drop back to a
  // status word, which reads as if the work restarted. Keep the highest
  // percentage seen and never show anything below it. A resumed task starts
  // from the percentage the previous visit ended on.
  let highestPercent = progressPercent(options.startProgress)

  for (;;) {
    await delay(wait)
    if (options.isCancelled()) return null

    let state: VideoTaskState
    try {
      state = await fetchVideoTask({
        apiKey: options.apiKey,
        taskId: options.taskId,
      })
    } catch (error) {
      if (!isTransientFailure(error)) throw error
      wait = Math.min(wait * 2, interval * 4)
      continue
    }
    if (options.isCancelled()) return null
    wait = interval

    if (state.status === 'done') {
      if (!state.resultUrl) {
        throw new Error(t('The task finished without a video'))
      }
      return state.resultUrl
    }
    if (state.status === 'failed') {
      throw new Error(state.error || t('Video generation failed'))
    }
    // An empty progress has nothing the panel could show.
    if (state.progress === '') continue
    const percent = progressPercent(state.progress)
    if (percent === null) {
      // A status word explains the wait, but only until the vendor reports a
      // percentage: after that it would reset the bar to 0.
      if (highestPercent === null) options.onProgress(state.progress)
      continue
    }
    // The same percentage carries no news, and a lower one would drag the bar
    // backwards. Only a strictly higher value replaces what the panel shows.
    if (highestPercent !== null && percent <= highestPercent) continue
    highestPercent = percent
    options.onProgress(state.progress)
  }
}
