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
import type {
  GenerationKind,
  GenerationValues,
  ReferenceAttachment,
} from '../types'

import type {
  GenerationInputField,
  GenerationSchema,
} from '@/features/pricing/types'

export type ParamField = GenerationInputField

export type ModelCapability = Omit<GenerationSchema, 'referenceImages'> & {
  kind: GenerationKind
  referenceImages: GenerationSchema['referenceImages'] | null
  mediaNotice: boolean
}

/** The server returns a channel-derived schema; missing profiles expose no controls. */
export function capabilityFor(
  kind: GenerationKind,
  schema?: GenerationSchema
): ModelCapability {
  return {
    kind,
    fields: schema?.fields ?? [],
    referenceImages: schema?.referenceImages ?? null,
    mediaNotice: schema?.mediaNotice ?? false,
  }
}

export function defaultValues(capability: ModelCapability): GenerationValues {
  const values: GenerationValues = {}
  for (const field of capability.fields) {
    values[field.key] = String(field.defaultValue)
  }
  return values
}

export function compatibleValues(
  capability: ModelCapability,
  values: GenerationValues
): GenerationValues {
  const next = defaultValues(capability)
  for (const field of capability.fields) {
    const value = values[field.key]
    if (value == null || value === '') continue
    if (
      field.type === 'select' &&
      !field.options?.some((option) => option.value === value)
    ) {
      continue
    }
    if (field.type === 'number') {
      const number = Number(value)
      if (!Number.isFinite(number)) continue
      next[field.key] = String(
        Math.max(field.min ?? number, Math.min(field.max ?? number, Math.round(number)))
      )
      continue
    }
    next[field.key] = value
  }
  return next
}

type GenerationRequest = Record<string, unknown> & {
  image?: string[]
  images?: string[]
}

function applyFields(
  request: GenerationRequest,
  fields: ParamField[],
  values: GenerationValues
): void {
  for (const field of fields) {
    const raw = values[field.key] ?? String(field.defaultValue)
    let value: string | number | boolean = raw
    if (field.type === 'number' || field.valueType === 'number') {
      const parsed = Number(raw)
      if (!Number.isFinite(parsed)) continue
      value = parsed
    } else if (field.valueType === 'boolean') {
      if (raw !== 'true' && raw !== 'false') continue
      value = raw === 'true'
    }
    let target = request
    for (const segment of field.requestPath.slice(0, -1)) {
      const nested = target[segment]
      if (nested === null || typeof nested !== 'object' || Array.isArray(nested)) {
        target[segment] = {}
      }
      target = target[segment] as GenerationRequest
    }
    const last = field.requestPath.at(-1)
    if (last) target[last] = value
  }
}

function withReferenceImages<T extends GenerationRequest>(
  request: T,
  capability: ModelCapability,
  references: string[]
): T {
  const spec = capability.referenceImages
  if (!spec || references.length === 0) return request
  request[spec.field] = references.slice(0, spec.max).map((reference) => {
    if (spec.encoding === 'dataUrl') return reference
    const comma = reference.indexOf(',')
    return reference.startsWith('data:') && comma >= 0
      ? reference.slice(comma + 1)
      : reference
  })
  return request
}

export function buildImageRequest(
  values: GenerationValues,
  capability: ModelCapability,
  references: string[] = []
): GenerationRequest {
  const request: GenerationRequest = {}
  applyFields(request, capability.fields, compatibleValues(capability, values))
  return withReferenceImages(request, capability, references)
}

export function buildVideoRequest(
  values: GenerationValues,
  capability: ModelCapability,
  references: string[] = [],
  mediaReferences: ReferenceAttachment[] = []
): GenerationRequest {
  const request: GenerationRequest = {}
  applyFields(request, capability.fields, compatibleValues(capability, values))
  withReferenceImages(request, capability, references)

  const videos = mediaReferences
    .filter((reference) => reference.mediaType.startsWith('video/'))
    .map((reference) => reference.url)
  const audios = mediaReferences
    .filter((reference) => reference.mediaType.startsWith('audio/'))
    .map((reference) => reference.url)
  if (videos.length > 0) {
    request.reference_videos = videos
  }
  if (audios.length > 0) {
    request.reference_audios = audios
  }
  if (videos.length > 0 || audios.length > 0) {
    const metadata = request.metadata
    request.metadata = {
      ...(metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata)
        ? metadata
        : {}),
      ...(videos.length > 0 ? { reference_video: videos } : {}),
      ...(audios.length > 0 ? { reference_audio: audios } : {}),
      input: {
      media: [
        ...videos.map((url) => ({ type: 'reference_video', url })),
        ...audios.map((url) => ({ type: 'reference_audio', url })),
      ],
      },
    }
  }
  return request
}

export function summarizeValues(
  capability: ModelCapability,
  values: GenerationValues
): string {
  return capability.fields
    .map((field) => {
      const value = values[field.key]
      if (field.key === 'seconds') return value ? `${value}s` : ''
      if (field.key === 'count') return value ? `×${value}` : ''
      return value
    })
    .filter((value): value is string => Boolean(value))
    .join(' · ')
}
