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
  data?: { enabled: boolean; multipart_enabled?: boolean }
}

type QuickGenerateMultipartGrant = {
  exists: boolean
  url: string
  key?: string
  upload_id?: string
  part_size?: number
  parts?: { part_number: number; url: string }[]
}

type QuickGenerateMultipartResponse = {
  success: boolean
  message?: string
  data?: QuickGenerateMultipartGrant
}

/** Files at or above this size take the multipart path. */
const MULTIPART_THRESHOLD_BYTES = 20 * 1024 * 1024
const MULTIPART_CONCURRENCY = 3
const MULTIPART_RETRIES = 3

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
  digest: string,
  multipartAllowed: boolean,
  onUploaded: () => void
): Promise<string> {
  if (multipartAllowed && blob.size >= MULTIPART_THRESHOLD_BYTES) {
    return uploadQuickGenerateMultipart(blob, mediaType, digest, onUploaded)
  }
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
  if (!grant.exists) {
    if (!grant.put_url) throw new Error(t('Generation failed'))
    const upload = await fetch(grant.put_url, {
      method: 'PUT',
      headers: grant.headers,
      body: blob,
    })
    if (!upload.ok) throw new Error(t('Generation failed'))
  }
  onUploaded()
  return grant.url
}

/** Sends one part, retrying a few times since a slice costs little to resend. */
async function putQuickGeneratePart(url: string, chunk: Blob): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt < MULTIPART_RETRIES; attempt++) {
    try {
      const response = await fetch(url, { method: 'PUT', body: chunk })
      if (!response.ok) throw new Error(t('Generation failed'))
      const etag = response.headers.get('ETag')
      if (!etag) throw new Error(t('Generation failed'))
      return etag
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(t('Generation failed'))
}

/**
 * Uploads a large file in slices so a slow connection never has to hold one
 * long request open, then asks the gateway to assemble and verify it.
 */
async function uploadQuickGenerateMultipart(
  blob: Blob,
  mediaType: string,
  digest: string,
  onUploaded: () => void
): Promise<string> {
  const begin = await api.post<QuickGenerateMultipartResponse>(
    '/api/quick-generate/upload/multipart',
    {
      sha256: digest,
      content_type: blob.type || mediaType,
      size: blob.size,
    }
  )
  const grant = begin.data.data
  if (!begin.data.success || !grant) {
    throw createServerError(begin.data, t('Generation failed'))
  }
  if (grant.exists) {
    if (!grant.url) throw new Error(t('Generation failed'))
    onUploaded()
    return grant.url
  }
  const parts = grant.parts ?? []
  const partSize = grant.part_size ?? 0
  if (!grant.key || !grant.upload_id || parts.length === 0 || partSize <= 0) {
    throw new Error(t('Generation failed'))
  }

  const etags = new Map<number, string>()
  const queue = [...parts]
  const worker = async () => {
    for (let part = queue.shift(); part; part = queue.shift()) {
      const start = (part.part_number - 1) * partSize
      const chunk = blob.slice(start, Math.min(start + partSize, blob.size))
      etags.set(part.part_number, await putQuickGeneratePart(part.url, chunk))
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(MULTIPART_CONCURRENCY, parts.length) },
      worker
    )
  )

  const complete = await api.post<{
    success: boolean
    message?: string
    data?: { url: string }
  }>('/api/quick-generate/upload/multipart/complete', {
    key: grant.key,
    upload_id: grant.upload_id,
    content_type: blob.type || mediaType,
    size: blob.size,
    sha256: digest,
    parts: parts.map((part) => ({
      part_number: part.part_number,
      etag: etags.get(part.part_number),
    })),
  })
  if (!complete.data.success || !complete.data.data?.url) {
    throw createServerError(complete.data, t('Generation failed'))
  }
  onUploaded()
  return complete.data.data.url
}

/**
 * Moves local attachments into temporary object storage. Objects are keyed by
 * content digest, so identical files share one upload and one stored object.
 * `onProgress` reports uploaded bytes so the composer can show a spinner.
 */
export async function uploadQuickGenerateReferences(
  references: ReferenceAttachment[],
  onProgress?: (uploaded: number, total: number) => void
): Promise<ReferenceAttachment[]> {
  if (references.length === 0) return []

  const statusResponse = await api.get<QuickGenerateUploadStatusResponse>(
    '/api/quick-generate/upload/status'
  )
  if (!statusResponse.data.success || !statusResponse.data.data?.enabled) {
    throw new Error(t('Temporary file storage is not configured'))
  }
  const multipartAllowed = Boolean(statusResponse.data.data.multipart_enabled)

  const localReferences = references.filter(
    (reference) =>
      reference.url.startsWith('blob:') || reference.url.startsWith('data:')
  )
  const total = localReferences.length
  let done = 0
  const report = () => {
    done += 1
    onProgress?.(done, total)
  }
  const urlsByDigest = new Map<string, string>()
  const uploadedReferences: ReferenceAttachment[] = []
  for (const reference of references) {
    if (
      !reference.url.startsWith('blob:') &&
      !reference.url.startsWith('data:')
    ) {
      uploadedReferences.push(reference)
      continue
    }
    const response = await fetch(reference.url)
    if (!response.ok) throw new Error(t('Generation failed'))
    const blob = await response.blob()
    const digest = await sha256Hex(await blob.arrayBuffer())
    let url = urlsByDigest.get(digest)
    if (!url) {
      url = await prepareQuickGenerateUpload(
        blob,
        reference.mediaType,
        digest,
        multipartAllowed,
        report
      )
      urlsByDigest.set(digest, url)
    } else {
      report()
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
  request: Record<string, unknown>
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
