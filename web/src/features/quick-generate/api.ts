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

import { createServerError } from '@/lib/server-error-message'

import type { VideoRequest } from './lib/capabilities'

type SubmitPayload = {
  task_id?: string
  id?: string
  code?: string
  message?: string
}

type FetchPayload = {
  code?: string
  message?: string
  data?: {
    status?: string
    progress?: string
    result_url?: string
    fail_reason?: string
  }
}

export type VideoTaskStatus = 'queued' | 'running' | 'done' | 'failed'

export type VideoTaskState = {
  status: VideoTaskStatus
  progress: string
  resultUrl: string
  error: string
}

const STATUS_MAP: Record<string, VideoTaskStatus> = {
  NOT_START: 'queued',
  SUBMITTED: 'queued',
  QUEUED: 'queued',
  IN_PROGRESS: 'running',
  SUCCESS: 'done',
  FAILURE: 'failed',
}

/**
 * Submit a video job on the generic task endpoint. Unlike the OpenAI-compatible
 * `/v1/videos`, its task DTO carries `result_url`, which is usually the
 * vendor's own signed address — the browser then plays it without the video
 * bytes crossing this gateway.
 */
export async function submitVideo(params: {
  apiKey: string
  model: string
  prompt: string
  request: VideoRequest
}): Promise<string> {
  const response = await fetch('/v1/video/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      prompt: params.prompt,
      ...params.request,
    }),
  })

  const payload = (await response
    .json()
    .catch(() => null)) as SubmitPayload | null

  if (!response.ok) {
    throw createServerError(payload, t('Video generation failed'))
  }

  const taskId = payload?.task_id || payload?.id
  if (!taskId) {
    throw new Error(t('The model returned no task'))
  }
  return String(taskId)
}

/** Read one poll of a video task. */
export async function fetchVideoTask(params: {
  apiKey: string
  taskId: string
}): Promise<VideoTaskState> {
  const response = await fetch(
    `/v1/video/generations/${encodeURIComponent(params.taskId)}`,
    { headers: { Authorization: `Bearer ${params.apiKey}` } }
  )

  const payload = (await response
    .json()
    .catch(() => null)) as FetchPayload | null

  if (!response.ok) {
    throw createServerError(payload, t('Failed to read the video task'))
  }

  const data = payload?.data ?? {}
  return {
    status: STATUS_MAP[String(data.status ?? '').toUpperCase()] ?? 'queued',
    progress: String(data.progress ?? ''),
    resultUrl: String(data.result_url ?? ''),
    error: String(data.fail_reason ?? ''),
  }
}
