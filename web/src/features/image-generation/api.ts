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

import { fetchTokenKey, getApiKeys } from '@/features/keys/api'
import { API_KEY_STATUS } from '@/features/keys/constants'
import type { ApiKey } from '@/features/keys/types'
import {
  createServerError,
  requireServerSuccess,
} from '@/lib/server-error-message'

import type { GenerateImageParams } from './types'

type ImageGenerationPayload = {
  data?: { url?: string; b64_json?: string }[]
}

/** Enabled API keys, newest first, for the generation key picker. */
export async function listEnabledApiKeys(): Promise<ApiKey[]> {
  const response = requireServerSuccess(await getApiKeys({ p: 1, size: 100 }))
  return (response.data?.items ?? []).filter(
    (item) => item.status === API_KEY_STATUS.ENABLED
  )
}

/**
 * The list endpoint returns a masked `key`, so fetch the real secret for the
 * chosen token. Returns the full `sk-...` credential the relay expects.
 */
export async function resolveApiKey(id: number): Promise<string> {
  const result = await fetchTokenKey(id)
  if (!result.success || !result.data?.key) {
    throw createServerError(result, t('Failed to load API keys'))
  }
  return `sk-${result.data.key}`
}

/** A data-URL reference as the file the image-edit form expects. */
function referenceFile(url: string, index: number): File {
  const marker = ';base64,'
  const start = url.indexOf(marker)
  if (!url.startsWith('data:') || start < 0) {
    throw new Error(t('Image generation failed'))
  }
  const mime = url.slice('data:'.length, start).split(';')[0] || 'image/png'
  const binary = atob(url.slice(start + marker.length))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  const subtype = mime.split('/')[1] || 'png'
  return new File([bytes], `reference-${index + 1}.${subtype}`, { type: mime })
}

/** gpt-image edits form. Each reference is a file in the `image` field. */
function imageEditForm(
  params: GenerateImageParams,
  references: string[]
): FormData {
  const form = new FormData()
  form.append('model', params.model)
  form.append('prompt', params.prompt)
  form.append('n', String(params.count))
  if (params.size) form.append('size', params.size)
  if (params.quality) form.append('quality', params.quality)
  for (const [index, url] of references.entries()) {
    form.append('image', referenceFile(url, index))
  }
  return form
}

/**
 * Call the OpenAI-compatible image endpoint with the user's own key.
 *
 * The endpoint relays through the project's task-plugin protocols, so every
 * configured image model — including plugin-backed ones — is reachable. The
 * session-authenticated `/pg` routes only cover chat completions.
 */
export async function generateImages(
  params: GenerateImageParams
): Promise<string[]> {
  const references = [...(params.image ?? []), ...(params.images ?? [])]
  const edits =
    references.length > 0 && /(gpt-image|chatgpt-image)/i.test(params.model)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${params.apiKey}`,
  }
  let path = '/v1/images/generations'
  let body: BodyInit
  if (edits) {
    path = '/v1/images/edits'
    body = imageEditForm(params, references)
  } else {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify({
      model: params.model,
      prompt: params.prompt,
      n: params.count,
      size: params.size,
      ...(params.quality ? { quality: params.quality } : {}),
      ...(params.image?.length ? { image: params.image } : {}),
      ...(params.images?.length ? { images: params.images } : {}),
    })
  }
  const response = await fetch(path, {
    method: 'POST',
    headers,
    body,
  })

  const payload = (await response
    .json()
    .catch(() => null)) as ImageGenerationPayload | null

  if (!response.ok) {
    throw createServerError(payload, t('Image generation failed'))
  }

  const images = (payload?.data ?? [])
    .map(
      (item) =>
        item.url ||
        (item.b64_json ? `data:image/png;base64,${item.b64_json}` : '')
    )
    .filter(Boolean)

  if (images.length === 0) {
    throw new Error(t('The model returned no images'))
  }

  return images
}
