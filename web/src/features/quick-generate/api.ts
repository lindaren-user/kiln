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

import { api } from '@/lib/api'
import { createServerError } from '@/lib/server-error-message'

import type { VideoRequest } from './lib/capabilities'
import type { ReferenceAttachment } from './types'

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

type QuickGenerateUploadGrant = {
  exists: boolean
  url: string
  put_url?: string
  headers?: Record<string, string>
}

type QuickGenerateUploadResponse = {
  success: boolean
  message?: string
  data?: QuickGenerateUploadGrant
}

type QuickGenerateUploadStatusResponse = {
  success: boolean
  data?: { enabled: boolean }
}

function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  return crypto.subtle
    .digest('SHA-256', bytes)
    .then((digest) =>
      Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0')
      ).join('')
    )
}

/** Reserves a slot for `blob`, uploading it first when it is not stored yet. */
async function prepareQuickGenerateUpload(
  blob: Blob,
  mediaType: string,
  digest: string
): Promise<string> {
  const response = await api.post<QuickGenerateUploadResponse>(
    '/api/quick-generate/upload',
    {
      sha256: digest,
      content_type: blob.type || mediaType,
      size: blob.size,
    }
  )
  const grant = response.data.data
  if (!response.data.success || !grant?.url) {
    throw createServerError(response.data, t('Generation failed'))
  }
  if (grant.exists) return grant.url
  if (!grant.put_url) throw new Error(t('Generation failed'))
  const upload = await fetch(grant.put_url, {
    method: 'PUT',
    headers: grant.headers,
    body: blob,
  })
  if (!upload.ok) throw new Error(t('Generation failed'))
  return grant.url
}

/**
 * Moves local attachments into temporary object storage. Objects are keyed by
 * content digest, so identical files share one upload and one stored object.
 */
export async function uploadQuickGenerateReferences(
  references: ReferenceAttachment[]
): Promise<ReferenceAttachment[]> {
  if (references.length === 0) return []

  const statusResponse = await api.get<QuickGenerateUploadStatusResponse>(
    '/api/quick-generate/upload/status'
  )
  if (!statusResponse.data.success || !statusResponse.data.data?.enabled) {
    throw new Error(t('Temporary file storage is not configured'))
  }

  const urlsByDigest = new Map<string, string>()
  const uploadedReferences: ReferenceAttachment[] = []
  for (const reference of references) {
    if (!reference.url.startsWith('blob:')) {
      uploadedReferences.push(reference)
      continue
    }
    const response = await fetch(reference.url)
    if (!response.ok) throw new Error(t('Generation failed'))
    const blob = await response.blob()
    const digest = await sha256Hex(await blob.arrayBuffer())
    let url = urlsByDigest.get(digest)
    if (!url) {
      url = await prepareQuickGenerateUpload(blob, reference.mediaType, digest)
      urlsByDigest.set(digest, url)
    }
    uploadedReferences.push({ ...reference, url })
  }
  return uploadedReferences
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
