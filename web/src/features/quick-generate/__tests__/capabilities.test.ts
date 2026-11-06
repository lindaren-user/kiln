/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { describe, expect, it } from 'vitest'

import type { GenerationSchema } from '@/features/pricing/types'

import {
  buildImageRequest,
  buildVideoRequest,
  capabilityFor,
  compatibleValues,
  defaultValues,
  summarizeValues,
} from '../lib/capabilities'

const IP233_MINIMAX_H3: GenerationSchema = {
  fields: [
    {
      key: 'seconds',
      labelKey: 'Duration',
      type: 'number',
      valueType: 'number',
      defaultValue: 4,
      min: 4,
      max: 15,
      requestPath: ['duration'],
    },
    {
      key: 'resolution',
      labelKey: 'Resolution',
      type: 'select',
      defaultValue: '768p',
      options: [{ value: '768p', label: '768p' }],
      requestPath: ['metadata', 'resolution'],
    },
    {
      key: 'ratio',
      labelKey: 'Aspect Ratio',
      type: 'select',
      defaultValue: '16:9',
      options: [
        { value: '16:9', label: '16:9' },
        { value: '9:16', label: '9:16' },
      ],
      requestPath: ['metadata', 'aspect_ratio'],
    },
  ],
}

describe('generation schemas', () => {
  it('uses the channel-provided schema and does not guess from model names', () => {
    expect(capabilityFor('video', IP233_MINIMAX_H3).fields).toEqual(
      IP233_MINIMAX_H3.fields
    )
    expect(capabilityFor('video').fields).toEqual([])
    expect(capabilityFor('image').fields).toEqual([])
  })

  it('keeps only values accepted by the selected model schema', () => {
    const capability = capabilityFor('video', IP233_MINIMAX_H3)

    expect(defaultValues(capability)).toEqual({
      seconds: '4',
      resolution: '768p',
      ratio: '16:9',
    })
    expect(
      compatibleValues(capability, {
        seconds: '40',
        resolution: '1080p',
        ratio: '9:16',
        unsupported: 'yes',
      })
    ).toEqual({ seconds: '15', resolution: '768p', ratio: '9:16' })
  })

  it('builds the request from each field requestPath and value type', () => {
    const request = buildVideoRequest(
      { seconds: '8', resolution: '768p', ratio: '9:16', extra: 'ignored' },
      capabilityFor('video', IP233_MINIMAX_H3)
    )

    expect(request).toEqual({
      duration: 8,
      metadata: { resolution: '768p', aspect_ratio: '9:16' },
    })
  })

  it('sends image parameters at their declared request paths', () => {
    const schema: GenerationSchema = {
      fields: [
        {
          key: 'size',
          labelKey: 'Size',
          type: 'select',
          defaultValue: '1024x1024',
          options: [{ value: '1024x1024', label: '1024x1024' }],
          requestPath: ['size'],
        },
        {
          key: 'count',
          labelKey: 'Count',
          type: 'select',
          valueType: 'number',
          defaultValue: '1',
          options: [{ value: '1', label: '1' }],
          requestPath: ['n'],
        },
      ],
    }

    expect(
      buildImageRequest(
        { size: '1024x1024', count: '1' },
        capabilityFor('image', schema)
      )
    ).toEqual({ size: '1024x1024', n: 1 })
  })

  it('adds reference images only when the channel declaration accepts them', () => {
    const capability = capabilityFor('image', {
      fields: [],
      referenceImages: { max: 1, field: 'images', encoding: 'base64' },
    })
    const dataUrl = 'data:image/png;base64,abc'

    expect(buildImageRequest({}, capability, [dataUrl])).toEqual({
      images: ['abc'],
    })
    expect(buildImageRequest({}, capabilityFor('image'), [dataUrl])).toEqual(
      {}
    )
  })

  it('summarizes the declared values', () => {
    expect(
      summarizeValues(capabilityFor('video', IP233_MINIMAX_H3), {
        seconds: '8',
        resolution: '768p',
        ratio: '16:9',
      })
    ).toBe('8s · 768p · 16:9')
  })
})
