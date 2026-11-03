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
  const response = await fetch('/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      prompt: params.prompt,
      n: params.count,
      size: params.size,
      ...(params.quality ? { quality: params.quality } : {}),
    }),
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
