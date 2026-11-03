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
import { describe, expect, it } from 'vitest'

import {
  buildImageRequest,
  buildVideoRequest,
  capabilityFor,
  defaultValues,
  summarizeValues,
} from '../lib/capabilities'

function fieldKeys(model: string, kind: 'image' | 'video'): string[] {
  return capabilityFor(model, kind).fields.map((field) => field.key)
}

function selectValues(
  model: string,
  kind: 'image' | 'video',
  key: string
): string[] {
  const field = capabilityFor(model, kind).fields.find(
    (candidate) => candidate.key === key
  )
  return field?.type === 'select'
    ? field.options.map((option) => option.value)
    : []
}

const FIXED_SIZE_IMAGE_MODELS = [
  {
    model: 'gpt-image-1',
    sizes: ['auto', '1024x1024', '1536x1024', '1024x1536'],
    counts: ['1', '2', '3', '4'],
  },
  {
    model: 'chatgpt-image-latest',
    sizes: ['auto', '1024x1024', '1536x1024', '1024x1536'],
    counts: ['1', '2', '3', '4'],
  },
  {
    // A channel alias still resolves to the OpenAI list.
    model: 'openai/gpt-image-1',
    sizes: ['auto', '1024x1024', '1536x1024', '1024x1536'],
    counts: ['1', '2', '3', '4'],
  },
  {
    model: 'dall-e-3',
    sizes: ['1024x1024', '1792x1024', '1024x1792'],
    counts: ['1'],
  },
  {
    model: 'azure/dall-e-3',
    sizes: ['1024x1024', '1792x1024', '1024x1792'],
    counts: ['1'],
  },
  {
    model: 'dall-e-2',
    sizes: ['256x256', '512x512', '1024x1024'],
    counts: ['1', '2', '3', '4'],
  },
]

const RATIO_IMAGE_MODELS = [
  'doubao-seedream-5-0-pro-260628',
  'gemini-2.5-flash-image',
  'z-image',
]

const VIDEO_MODELS = [
  'veo-3.0-generate-001',
  'kling-v2-5-turbo',
  'doubao-seedance-2-5-260628',
  'viduq3-pro',
  'wan3.0-video',
  'hailuo-02',
  'grok-imagine-video',
]

describe('model capabilities', () => {
  it.each(FIXED_SIZE_IMAGE_MODELS)(
    'gives $model a fixed size list and a count',
    ({ model, sizes, counts }) => {
      expect(fieldKeys(model, 'image')).toEqual(['size', 'count'])
      expect(selectValues(model, 'image', 'size')).toEqual(sizes)
      expect(selectValues(model, 'image', 'count')).toEqual(counts)
    }
  )

  it.each(RATIO_IMAGE_MODELS)(
    'gives %s the ratio, resolution and count controls',
    (model) => {
      expect(fieldKeys(model, 'image')).toEqual([
        'ratio',
        'resolution',
        'count',
      ])
      expect(defaultValues(capabilityFor(model, 'image'))).toEqual({
        ratio: '1:1',
        resolution: '1k',
        count: '1',
      })
    }
  )

  it.each(VIDEO_MODELS)(
    'gives %s a ratio, a resolution and a duration',
    (model) => {
      expect(fieldKeys(model, 'video')).toEqual([
        'ratio',
        'resolution',
        'seconds',
      ])
      expect(selectValues(model, 'video', 'ratio')).toEqual(['16:9', '9:16'])
      expect(selectValues(model, 'video', 'resolution')).toEqual([
        '720p',
        '1080p',
        '4k',
      ])
      expect(defaultValues(capabilityFor(model, 'video'))).toEqual({
        ratio: '16:9',
        resolution: '720p',
        seconds: '5',
      })
    }
  )

  it('keeps Sora 2 on the 720p sizes it accepts', () => {
    expect(fieldKeys('sora-2', 'video')).toEqual(['ratio', 'seconds'])
    expect(fieldKeys('openai/sora-2-pro', 'video')).toEqual([
      'ratio',
      'resolution',
      'seconds',
    ])
    expect(selectValues('openai/sora-2-pro', 'video', 'resolution')).toEqual([
      '720p',
      '1792',
    ])
  })

  it('sends Nano Banana Pro the aspect ratio and the image size', () => {
    expect(fieldKeys('nano-banana-pro', 'image')).toEqual([
      'ratio',
      'resolution',
      'count',
    ])
    expect(selectValues('gemini-3-pro-image', 'image', 'ratio')).toEqual([
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
    ])
    expect(
      buildImageRequest(
        { ratio: '16:9', resolution: '2k', count: '1' },
        'nano-banana-pro-preview'
      )
    ).toEqual({ size: '16:9', quality: '2K', count: 1 })
  })

  it('sends the explicit size when the model has one', () => {
    expect(buildImageRequest({ size: '1536x1024', count: '2' })).toEqual({
      size: '1536x1024',
      count: 2,
    })
  })

  it('derives the pixel size from ratio and resolution otherwise', () => {
    expect(
      buildImageRequest({ ratio: '16:9', resolution: '1k', count: '1' })
    ).toEqual({ size: '1536x1024', count: 1 })
  })

  it('falls back to one image when the count is missing', () => {
    expect(buildImageRequest({ size: '1024x1024' })).toEqual({
      size: '1024x1024',
      count: 1,
    })
  })

  it('maps the video ratio and resolution to pixels and keeps the duration', () => {
    expect(buildVideoRequest({ ratio: '9:16', resolution: '720p', seconds: '8' })).toEqual({
      size: '720x1280',
      duration: 8,
    })
    expect(
      buildVideoRequest({ ratio: '16:9', resolution: '1080p', seconds: '5' })
    ).toEqual({ size: '1920x1080', duration: 5 })
    expect(
      buildVideoRequest({ ratio: '9:16', resolution: '4k', seconds: '5' })
    ).toEqual({ size: '2160x3840', duration: 5 })
    expect(
      buildVideoRequest({ ratio: '16:9', resolution: '1792', seconds: '4' })
    ).toEqual({ size: '1792x1024', duration: 4 })
  })

  it('offers reference images only on models that read them', () => {
    expect(capabilityFor('dall-e-3', 'image').referenceImages).toBeNull()
    expect(capabilityFor('qwen-image-max', 'image').referenceImages).toBeNull()
    expect(capabilityFor('z-image-turbo', 'image').referenceImages).toBeNull()
    expect(capabilityFor('doubao-seedream-4-5-251128', 'image').referenceImages).toEqual({
      max: 14,
      field: 'image',
      encoding: 'dataUrl',
    })
    expect(capabilityFor('doubao-seedream-5-0-pro-260628', 'image').referenceImages?.max).toBe(10)
    expect(capabilityFor('qwen-image-2.0', 'image').referenceImages).toEqual({
      max: 3,
      field: 'images',
      encoding: 'dataUrl',
    })
    expect(capabilityFor('sora-2', 'video').referenceImages).toEqual({
      max: 1,
      field: 'images',
      encoding: 'dataUrl',
    })
    expect(capabilityFor('kling-v2-5-turbo', 'video').referenceImages?.max).toBe(2)
    expect(capabilityFor('jimeng-video', 'video').referenceImages).toEqual({
      max: 4,
      field: 'images',
      encoding: 'base64',
    })
    expect(capabilityFor('wan2.2-s2v', 'video').referenceImages).toBeNull()
    expect(capabilityFor('wan2.7-t2v', 'video').referenceImages).toBeNull()
  })

  it('warns when the model can take reference audio or video', () => {
    expect(capabilityFor('sora-2', 'video').mediaNotice).toBe(false)
    expect(capabilityFor('wan3.0-video', 'video').mediaNotice).toBe(true)
    expect(capabilityFor('MiniMax-H3', 'video').mediaNotice).toBe(true)
    expect(capabilityFor('doubao-seedance-2-5-260628', 'video').mediaNotice).toBe(true)
    expect(capabilityFor('grok-imagine-video', 'video').mediaNotice).toBe(true)
    expect(capabilityFor('kling-4.0', 'video').mediaNotice).toBe(true)
    expect(capabilityFor('wan2.2-s2v', 'video').mediaNotice).toBe(true)
    expect(capabilityFor('gpt-image-1', 'image').mediaNotice).toBe(false)
  })

  it('puts reference images on the field the model reads', () => {
    const dataUrl = 'data:image/png;base64,aaa'
    expect(
      buildImageRequest({ size: '1024x1024', count: '1' }, 'doubao-seedream-4-0', [dataUrl])
    ).toEqual({
      size: '1024x1024',
      count: 1,
      image: [dataUrl],
    })
    expect(
      buildImageRequest({ size: '1024x1024', count: '1' }, 'qwen-image-2.0', [dataUrl])
    ).toEqual({
      size: '1024x1024',
      count: 1,
      images: [dataUrl],
    })
    expect(
      buildImageRequest({ size: '1024x1024', count: '1' }, 'dall-e-3', [dataUrl])
    ).toEqual({ size: '1024x1024', count: 1 })
    expect(
      buildVideoRequest({ ratio: '16:9', seconds: '5' }, 'sora-2', [dataUrl])
    ).toEqual({
      size: '1280x720',
      duration: 5,
      images: [dataUrl],
    })
    expect(
      buildVideoRequest({ ratio: '16:9', seconds: '5' }, 'jimeng-video', [dataUrl])
    ).toMatchObject({ images: ['aaa'] })
    expect(buildVideoRequest({ ratio: '16:9', seconds: '5' }, 'sora-2')).toEqual({
      size: '1280x720',
      duration: 5,
    })
  })

  it('omits a duration that is not a positive number', () => {
    expect(buildVideoRequest({ ratio: '16:9', seconds: '' })).toEqual({
      size: '1280x720',
    })
  })

  it('summarizes the parameters the request used', () => {
    expect(
      summarizeValues(capabilityFor('gpt-image-1', 'image'), {
        size: '1024x1024',
        count: '2',
      })
    ).toBe('1024 × 1024 · ×2')
    expect(
      summarizeValues(capabilityFor('sora-2', 'video'), {
        ratio: '16:9',
        seconds: '5',
      })
    ).toBe('16:9 · 5s')
    expect(
      summarizeValues(capabilityFor('veo-3.0-generate-001', 'video'), {
        ratio: '16:9',
        resolution: '1080p',
        seconds: '8',
      })
    ).toBe('16:9 · 1080p · 8s')
  })
})
