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
import {
  DEFAULT_IMAGE_RATIO,
  DEFAULT_IMAGE_RESOLUTION,
  IMAGE_COUNT_ITEMS,
  IMAGE_RATIO_ITEMS,
  IMAGE_RESOLUTION_ITEMS,
  buildImageSize,
  type ImageResolution,
} from '@/features/image-generation/constants'

import type {
  GenerationKind,
  GenerationValues,
  ReferenceAttachment,
} from '../types'

export type ParamOption = { value: string; label: string }

/**
 * One control in the composer footer. The backend exposes only the endpoint
 * type a model answers on, never its request parameters, so this table is the
 * single place that knows what a model accepts. Add a rule here to teach the
 * page a new model family.
 */
export type ParamField =
  | {
      key: string
      labelKey: string
      type: 'select'
      options: ParamOption[]
      defaultValue: string
    }
  | {
      key: string
      labelKey: string
      type: 'number'
      defaultValue: number
      min: number
      max: number
      suffix?: string
    }

/**
 * Reference images this model accepts on the generation request.
 * `field` is the JSON key the model's adaptor reads. Jimeng stores the
 * bytes as raw base64; everyone else keeps the data URL.
 */
export type ReferenceImages = {
  max: number
  field: 'images' | 'image'
  encoding: 'dataUrl' | 'base64'
}

export type ModelCapability = {
  kind: GenerationKind
  fields: ParamField[]
  /** Absent when this model does not accept reference images. */
  referenceImages: ReferenceImages | null
  /** The model can accept reference audio or video in addition to images. */
  mediaNotice: boolean
}

const IMAGE_RATIO_FIELD: ParamField = {
  key: 'ratio',
  labelKey: 'Aspect Ratio',
  type: 'select',
  options: IMAGE_RATIO_ITEMS,
  defaultValue: DEFAULT_IMAGE_RATIO,
}

const IMAGE_RESOLUTION_FIELD: ParamField = {
  key: 'resolution',
  labelKey: 'Resolution',
  type: 'select',
  options: IMAGE_RESOLUTION_ITEMS,
  defaultValue: DEFAULT_IMAGE_RESOLUTION,
}

const IMAGE_COUNT_FIELD: ParamField = {
  key: 'count',
  labelKey: 'Count',
  type: 'select',
  options: IMAGE_COUNT_ITEMS,
  defaultValue: '1',
}

/**
 * Video APIs take `WIDTHxHEIGHT`. The page picks the pixels for the chosen
 * aspect ratio and resolution, and each vendor maps that frame onto the tier
 * it supports. Ratios without a published pixel size (auto, adaptive) are
 * sent as the ratio itself.
 */
const DEFAULT_VIDEO_RATIOS = ['16:9', '9:16']

/**
 * First match wins. These lists are the aspect ratios each plugin documents,
 * not a shared pair. Models that publish none of these keep 16:9 and 9:16.
 */
const VIDEO_RATIO_RULES: { test: RegExp; ratios: string[] }[] = [
  { test: /^sd2-933-720p-9:16$/, ratios: ['9:16'] },
  {
    test: /^minimaxh3$/,
    ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
  },
  {
    test: /^sd2\.5-y$/,
    ratios: ['auto', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
  },
  {
    test: /^seedance_v2\.5$/,
    ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
  },
  { test: /^kling-4\.0/, ratios: ['16:9', '9:16', '1:1', '21:9'] },
  { test: /^kling/i, ratios: ['16:9', '9:16', '1:1'] },
  {
    test: /^grok-imagine-video$/,
    ratios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '5:2'],
  },
  { test: /^jimeng/, ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'] },
  {
    test: /^wan3\.0-video/,
    ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'],
  },
  { test: /^wan3-/, ratios: ['16:9', '9:16', '1:1'] },
  { test: /^wan/, ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'] },
  { test: /SD2|sd2|Minimax-/, ratios: ['16:9', '9:16', '1:1'] },
]

const VIDEO_RESOLUTION_ITEMS: ParamOption[] = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '4k', label: '4K' },
]

/** Pixels whose aspect is the ratio. Vendors that only read `size` use these. */
const VIDEO_PIXELS: Record<string, Record<string, string>> = {
  '720p': {
    '16:9': '1280x720',
    '9:16': '720x1280',
    '1:1': '720x720',
    '4:3': '960x720',
    '3:4': '720x960',
    '3:2': '1080x720',
    '2:3': '720x1080',
    '21:9': '1680x720',
    '5:2': '1800x720',
  },
  '1080p': {
    '16:9': '1920x1080',
    '9:16': '1080x1920',
    '1:1': '1080x1080',
    '4:3': '1440x1080',
    '3:4': '1080x1440',
    '3:2': '1620x1080',
    '2:3': '1080x1620',
    '21:9': '2520x1080',
    '5:2': '2700x1080',
  },
  '4k': {
    '16:9': '3840x2160',
    '9:16': '2160x3840',
    '1:1': '2160x2160',
    '4:3': '2880x2160',
    '3:4': '2160x2880',
    '3:2': '3240x2160',
    '2:3': '2160x3240',
    '21:9': '5040x2160',
    '5:2': '5400x2160',
  },
  // Sora 2 Pro's higher official size. It is not 1920x1080.
  '1792': { '16:9': '1792x1024', '9:16': '1024x1792' },
}

/**
 * Wan rejects a size that is not in its published tables. 16:9 and 9:16 match
 * the generic pixels; the square and 4:3 frames do not.
 */
const WAN_PIXELS: Record<string, Record<string, string>> = {
  '720p': {
    '16:9': '1280x720',
    '9:16': '720x1280',
    '1:1': '960x960',
    '4:3': '1104x832',
    '3:4': '832x1104',
  },
  '1080p': {
    '16:9': '1920x1080',
    '9:16': '1080x1920',
    '1:1': '1440x1440',
    '4:3': '1648x1248',
    '3:4': '1248x1648',
  },
}

function videoRatios(model: string): string[] {
  return (
    VIDEO_RATIO_RULES.find((rule) => rule.test.test(model))?.ratios ??
    DEFAULT_VIDEO_RATIOS
  )
}

function videoRatioField(model: string): ParamField {
  const ratios = videoRatios(model)
  return {
    key: 'ratio',
    labelKey: 'Aspect Ratio',
    type: 'select',
    options: ratios.map((ratio) => ({ value: ratio, label: ratio })),
    defaultValue: ratios.includes('16:9') ? '16:9' : (ratios[0] ?? '16:9'),
  }
}

function isAlibabaWan(model: string): boolean {
  return model.startsWith('wan') && !model.startsWith('wan3-')
}

function videoFrame(
  model: string,
  resolution: string,
  ratio: string
): string | undefined {
  const table = isAlibabaWan(model) ? WAN_PIXELS : VIDEO_PIXELS
  return (table[resolution] ?? table['720p'])?.[ratio]
}

const VIDEO_RESOLUTION_FIELD: ParamField = {
  key: 'resolution',
  labelKey: 'Resolution',
  type: 'select',
  options: VIDEO_RESOLUTION_ITEMS,
  defaultValue: '720p',
}

/** Sora 2 Pro accepts 720p and one larger official size, not 1080p or 4K. */
const SORA_PRO_RESOLUTION_FIELD: ParamField = {
  key: 'resolution',
  labelKey: 'Resolution',
  type: 'select',
  options: [
    { value: '720p', label: '720p' },
    { value: '1792', label: '1792×1024' },
  ],
  defaultValue: '720p',
}

/**
 * Inclusive second ranges the quick-generate page will send. Top Image
 * families differ: SD2.5, wan3 and Kling 4.0 accept 4-30; SD2.0 and MiniMax
 * accept 4-15. Asdada publishes its own ranges. Other vendors do not publish
 * a range here, so they keep the page bound of 1-60 instead of a guessed list.
 */
const VIDEO_DURATION_RULES: { test: RegExp; min: number; max: number }[] = [
  { test: /^sd2-933-720p-9:16$/, min: 5, max: 15 },
  { test: /^(?:minimaxh3|sd2\.5-y|seedance_v2\.5)$/, min: 4, max: 30 },
  { test: /SD2\.5/, min: 4, max: 30 },
  { test: /^wan3-/, min: 4, max: 30 },
  { test: /^kling-4\.0/, min: 4, max: 30 },
  { test: /SD2\.0|sd2\.0|^sd2-/, min: 4, max: 15 },
  { test: /^Minimax-|^MiniMax-/, min: 4, max: 15 },
]

function videoDurationBounds(model: string): { min: number; max: number } {
  const rule = VIDEO_DURATION_RULES.find((item) => item.test.test(model))
  return rule ?? { min: 1, max: 60 }
}

function videoSecondsField(model: string): ParamField {
  const bounds = videoDurationBounds(model)
  return {
    key: 'seconds',
    labelKey: 'Duration {{min}}-{{max}}s',
    type: 'number',
    defaultValue: 5,
    min: bounds.min,
    max: bounds.max,
  }
}

type ImageSizeRule = {
  test: RegExp
  sizes: string[]
  defaultSize: string
  counts: string[]
}

/**
 * OpenAI's image models accept a fixed size list instead of a free ratio.
 * Matching is by substring so a channel alias such as `openai/gpt-image-1`
 * still resolves to the right list.
 */
/**
 * Nano Banana Pro takes an aspect ratio and an image size, not a pixel size.
 * Gemini image models of the same family use the same pair.
 */
const NANO_BANANA_RATIO_FIELD: ParamField = {
  key: 'ratio',
  labelKey: 'Aspect Ratio',
  type: 'select',
  options: [
    '1:1',
    '2:3',
    '3:2',
    '3:4',
    '4:3',
    '4:5',
    '5:4',
    '9:16',
    '16:9',
    '21:9',
  ].map((value) => ({ value, label: value })),
  defaultValue: '1:1',
}

function isNanoBanana(model: string): boolean {
  return /nano-banana|gemini-[\d.]+-(?:flash|pro)-image/i.test(model)
}

const OPENAI_IMAGE_RULES: ImageSizeRule[] = [
  {
    test: /dall-e-2/i,
    sizes: ['256x256', '512x512', '1024x1024'],
    defaultSize: '1024x1024',
    counts: ['1', '2', '3', '4'],
  },
  {
    test: /dall-e-3/i,
    sizes: ['1024x1024', '1792x1024', '1024x1792'],
    defaultSize: '1024x1024',
    counts: ['1'],
  },
  {
    test: /(gpt-image|chatgpt-image)/i,
    sizes: ['auto', '1024x1024', '1536x1024', '1024x1536'],
    defaultSize: 'auto',
    counts: ['1', '2', '3', '4'],
  },
]

function sizeOption(value: string): ParamOption {
  return {
    value,
    label: value === 'auto' ? 'Auto' : value.replace('x', ' × '),
  }
}

/** Reference-image cap plus support for additional audio/video references. */
function referenceMedia(
  max: number | null,
  mediaNotice = false,
  spec: Partial<Pick<ReferenceImages, 'field' | 'encoding'>> = {}
): Pick<ModelCapability, 'referenceImages' | 'mediaNotice'> {
  if (max === null) return { referenceImages: null, mediaNotice }
  return {
    referenceImages: {
      max,
      field: spec.field ?? 'images',
      encoding: spec.encoding ?? 'dataUrl',
    },
    mediaNotice,
  }
}

/**
 * How many reference images the model reads, and whether it also accepts
 * audio or video. Counts follow the task plugins:
 * one frame, a first and last frame, or the plugin's reference-image cap.
 * The first matching rule wins.
 */
function mediaFor(
  model: string,
  kind: GenerationKind
): Pick<ModelCapability, 'referenceImages' | 'mediaNotice'> {
  if (kind === 'video') {
    // Speech-to-video needs an audio file this page does not send.
    if (/wan2\.2-s2v/i.test(model)) return referenceMedia(1, true)
    if (/wan2\.7-t2v/i.test(model)) return referenceMedia(null)
    if (/wan2\.7-i2v|wan3/i.test(model)) return referenceMedia(2, true)
    if (/seedance-1-0-lite-t2v/i.test(model)) return referenceMedia(null)
    if (/seedance-2/i.test(model)) return referenceMedia(4, true)
    if (/grok-imagine/i.test(model)) return referenceMedia(7, true)
    if (/minimax-h3|hailuo.*h3|h3.*hailuo/i.test(model)) {
      return referenceMedia(2, true)
    }
    if (/kling-4/i.test(model)) return referenceMedia(2, true)
    if (/kling|hailuo|minimax/i.test(model)) return referenceMedia(2)
    if (/vidu/i.test(model)) return referenceMedia(7)
    if (/jimeng/i.test(model)) {
      return referenceMedia(4, false, { encoding: 'base64' })
    }
    if (/seedance/i.test(model)) return referenceMedia(1)
    // Sora, Veo and any other video model: one reference frame.
    return referenceMedia(1)
  }

  if (/dall-e/i.test(model)) return referenceMedia(null)
  if (/qwen-image-edit|qwen-image-(?:2\.0|3\.0)/i.test(model)) {
    return referenceMedia(3)
  }
  if (/(?:^|\/)qwen-image(?:-plus|-max)?$/i.test(model)) {
    return referenceMedia(null)
  }
  if (/z-image-turbo|wan2\.6-t2i/i.test(model)) return referenceMedia(null)
  if (/wan2\.7-image/i.test(model)) return referenceMedia(9)
  if (/wan2\.6-image/i.test(model)) return referenceMedia(4)
  if (/seedream-5-0-(?:pro|flash)/i.test(model)) {
    return referenceMedia(10, false, { field: 'image' })
  }
  if (/seedream/i.test(model)) {
    return referenceMedia(14, false, { field: 'image' })
  }
  return referenceMedia(4)
}

function encodeReference(
  url: string,
  encoding: ReferenceImages['encoding']
): string {
  if (encoding === 'dataUrl') return url
  const comma = url.indexOf(',')
  if (url.startsWith('data:') && comma >= 0) return url.slice(comma + 1)
  return url
}

/** Puts reference images on the field the model reads, and drops an empty list. */
function withReferences<T extends ImageRequest | VideoRequest>(
  request: T,
  model: string,
  kind: GenerationKind,
  references: string[]
): T {
  const spec = mediaFor(model, kind).referenceImages
  if (!spec || references.length === 0) return request
  const encoded = references
    .slice(0, spec.max)
    .map((url) => encodeReference(url, spec.encoding))
  if (kind === 'image' && spec.field === 'image') {
    return { ...request, image: encoded }
  }
  return { ...request, images: encoded }
}

/** The controls a model shows: its endpoint type decides the shape, its name the options. */
export function capabilityFor(
  model: string,
  kind: GenerationKind
): ModelCapability {
  const media = mediaFor(model, kind)
  if (kind === 'video') {
    if (/sora-2-pro/i.test(model)) {
      return {
        kind,
        ...media,
        fields: [
          videoRatioField(model),
          SORA_PRO_RESOLUTION_FIELD,
          videoSecondsField(model),
        ],
      }
    }
    // Sora 2 only accepts the 720p pair, so a resolution list would offer
    // sizes the model rejects.
    if (/sora/i.test(model)) {
      return {
        kind,
        ...media,
        fields: [videoRatioField(model), videoSecondsField(model)],
      }
    }
    return {
      kind,
      ...media,
      fields: [
        videoRatioField(model),
        VIDEO_RESOLUTION_FIELD,
        videoSecondsField(model),
      ],
    }
  }

  const rule = OPENAI_IMAGE_RULES.find((candidate) =>
    candidate.test.test(model)
  )
  if (rule) {
    return {
      kind,
      ...media,
      fields: [
        {
          key: 'size',
          labelKey: 'Size',
          type: 'select',
          options: rule.sizes.map(sizeOption),
          defaultValue: rule.defaultSize,
        },
        {
          key: 'count',
          labelKey: 'Count',
          type: 'select',
          options: rule.counts.map((count) => ({ value: count, label: count })),
          defaultValue: rule.counts[0] ?? '1',
        },
      ],
    }
  }

  if (isNanoBanana(model)) {
    return {
      kind,
      ...media,
      fields: [
        NANO_BANANA_RATIO_FIELD,
        IMAGE_RESOLUTION_FIELD,
        IMAGE_COUNT_FIELD,
      ],
    }
  }

  return {
    kind,
    ...media,
    fields: [IMAGE_RATIO_FIELD, IMAGE_RESOLUTION_FIELD, IMAGE_COUNT_FIELD],
  }
}

export function defaultValues(capability: ModelCapability): GenerationValues {
  const values: GenerationValues = {}
  for (const field of capability.fields) {
    values[field.key] = String(field.defaultValue)
  }
  return values
}

/**
 * Keeps a stored choice only when the current model still offers it.
 * A ratio from the previous model must not be sent, or shown, after a switch.
 */
export function compatibleValues(
  capability: ModelCapability,
  values: GenerationValues
): GenerationValues {
  const next = defaultValues(capability)
  for (const field of capability.fields) {
    const stored = values[field.key]
    if (stored == null || stored === '') continue
    if (
      field.type === 'select' &&
      !field.options.some((option) => option.value === stored)
    ) {
      continue
    }
    next[field.key] = stored
  }
  return next
}

export type ImageRequest = {
  size: string
  count: number
  quality?: string
  /** Seedream reads `image`. Other image adaptors read `images`. */
  image?: string[]
  images?: string[]
}

/**
 * Image models either take an explicit size, or a ratio plus a resolution.
 * Nano Banana Pro keeps the ratio and sends the resolution as `quality`
 * (`1K`, `2K`, `4K`) instead of collapsing every ratio onto 3:2.
 */
export function buildImageRequest(
  values: GenerationValues,
  model = '',
  references: string[] = []
): ImageRequest {
  const parsed = Number(values.count ?? 1)
  const count = Number.isFinite(parsed) ? parsed : 1
  let request: ImageRequest
  if (isNanoBanana(model)) {
    request = {
      size: values.ratio ?? DEFAULT_IMAGE_RATIO,
      quality: (values.resolution ?? DEFAULT_IMAGE_RESOLUTION).toUpperCase(),
      count,
    }
  } else if (values.size) {
    request = { size: values.size, count }
  } else {
    const ratio = values.ratio ?? DEFAULT_IMAGE_RATIO
    const resolution = (values.resolution ??
      DEFAULT_IMAGE_RESOLUTION) as ImageResolution
    request = { size: buildImageSize(ratio, resolution), count }
  }
  return withReferences(request, model, 'image', references)
}

export type VideoRequest = {
  size?: string
  duration?: number
  images?: string[]
  reference_videos?: string[]
  reference_audios?: string[]
  image_url?: string
  audio_url?: string
  /**
   * Task submission keeps vendor fields on `metadata`. `ratio` and
   * `aspect_ratio` are what the video plugins read; Wan also reads
   * `metadata.parameters.ratio`.
   */
  metadata?: {
    ratio: string
    aspect_ratio: string
    parameters?: { ratio: string }
    reference_video?: string[]
    reference_audio?: string[]
    input?: { media: { type: string; url: string }[] }
  }
}

export function buildVideoRequest(
  values: GenerationValues,
  model = '',
  references: string[] = [],
  mediaReferences: ReferenceAttachment[] = []
): VideoRequest {
  const ratio = values.ratio ?? '16:9'
  const metadata: NonNullable<VideoRequest['metadata']> = {
    ratio,
    aspect_ratio: ratio,
  }
  if (isAlibabaWan(model)) metadata.parameters = { ratio }

  let request: VideoRequest = { metadata }
  const size = videoFrame(model, values.resolution ?? '720p', ratio)
  if (size) request.size = size

  const seconds = Number(values.seconds)
  if (Number.isFinite(seconds) && seconds > 0) {
    const bounds = videoDurationBounds(model)
    const rounded = Math.round(seconds)
    request.duration = Math.min(bounds.max, Math.max(bounds.min, rounded))
  }
  request = withReferences(request, model, 'video', references)

  const urlsOfType = (prefix: string) =>
    mediaReferences
      .filter((reference) => reference.mediaType.startsWith(prefix))
      .map((reference) => reference.url)
  const videos = urlsOfType('video/')
  const audios = urlsOfType('audio/')
  if (videos.length > 0) {
    request.reference_videos = videos
    metadata.reference_video = videos
  }
  if (audios.length > 0) {
    request.reference_audios = audios
    metadata.reference_audio = audios
  }
  if (/wan2\.2-s2v/i.test(model)) {
    if (references[0]) request.image_url = references[0]
    if (audios[0]) request.audio_url = audios[0]
  }
  if (/wan3/i.test(model) && (videos.length > 0 || audios.length > 0)) {
    metadata.input = {
      media: [
        ...videos.map((url) => ({ type: 'reference_video', url })),
        ...audios.map((url) => ({ type: 'reference_audio', url })),
      ],
    }
  }
  return request
}

/** One-line parameter summary for the result header. */
export function summarizeValues(
  capability: ModelCapability,
  values: GenerationValues
): string {
  const parts: string[] = []
  for (const field of capability.fields) {
    const value = values[field.key]
    if (!value) continue
    switch (field.key) {
      case 'count':
        parts.push(`×${value}`)
        break
      case 'seconds':
        parts.push(`${value}s`)
        break
      case 'resolution':
        parts.push(/k$/i.test(value) ? value.toUpperCase() : value)
        break
      case 'size':
        parts.push(value.replace('x', ' × '))
        break
      default:
        parts.push(value)
    }
  }
  return parts.join(' · ')
}
