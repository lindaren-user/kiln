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

import type { PricingModel } from '@/features/pricing/types'

import type { ModelCapability } from '../lib/capabilities'
import {
  pricedUsageValues,
  restrictToPricedOptions,
} from '../lib/priced-options'

function model(overrides: Partial<PricingModel>): PricingModel {
  return {
    id: 1,
    model_name: 'demo',
    quota_type: 0,
    model_ratio: 0,
    completion_ratio: 1,
    enable_groups: ['default'],
    ...overrides,
  }
}

function videoCapability(resolutions: string[]): ModelCapability {
  return {
    kind: 'video',
    fields: [
      {
        key: 'resolution',
        labelKey: 'Resolution',
        type: 'select',
        requestPath: ['metadata', 'resolution'],
        options: resolutions.map((value) => ({ value, label: value })),
        defaultValue: resolutions[0],
      },
      {
        key: 'seconds',
        labelKey: 'Duration',
        type: 'number',
        requestPath: ['seconds'],
        defaultValue: 5,
        min: 1,
        max: 30,
      },
    ],
    referenceImages: null,
    mediaNotice: false,
  }
}

const schema = {
  seconds: { type: 'number' as const, unit: 'second' as const },
  resolution: { enum: ['480P', '720P', '1080P'] },
}

describe('priced option filtering', () => {
  it('keeps only the resolutions a tier chain prices', () => {
    const priced = pricedUsageValues(
      model({
        billing_mode: 'tiered_expr',
        billing_expr:
          'u("resolution") == "1080P" ? tier("1080P", u("seconds") * 0.15) : u("resolution") == "720P" ? tier("720P", u("seconds") * 0.1) : tier("480P", u("seconds") * 0)',
        billing_usage_schema: schema,
      }),
      'resolution'
    )

    expect([...(priced ?? [])].sort()).toEqual(['1080P', '720P'])
  })

  it('keeps the model-supported fallback tier when the billing enum has extra values', () => {
    const capability = restrictToPricedOptions(
      model({
        billing_mode: 'tiered_expr',
        billing_expr:
          'u("resolution") == "480p" ? tier("480p", u("seconds") * 0.221) : tier("720p", u("seconds") * 0.325)',
        billing_usage_schema: {
          seconds: { type: 'number', unit: 'second' },
          resolution: { enum: ['480p', '720p', '768p'] },
        },
      }),
      videoCapability(['480p', '720p'])
    )

    expect(
      capability.fields[0]?.options?.map((option) => option.value)
    ).toEqual(['480p', '720p'])
  })

  it('reads resolutions nested inside a per-second coefficient', () => {
    const capability = restrictToPricedOptions(
      model({
        billing_mode: 'tiered_expr',
        billing_expr:
          'tier("base", u("seconds") * (u("resolution") == "1080P" ? 0.15 : 0))',
        billing_usage_schema: schema,
      }),
      videoCapability(['480P', '720P', '1080P'])
    )

    expect(
      capability.fields[0]?.options?.map((option) => option.value)
    ).toEqual(['1080P'])
  })

  it('replaces a default that was filtered out', () => {
    const capability = restrictToPricedOptions(
      model({
        billing_mode: 'tiered_expr',
        billing_expr:
          'u("resolution") == "1080P" ? tier("1080P", u("seconds") * 0.15) : tier("other", u("seconds") * 0.09)',
        billing_usage_schema: schema,
      }),
      videoCapability(['480P', '720P', '1080P'])
    )

    expect(
      capability.fields[0]?.options?.map((option) => option.value)
    ).toEqual(['1080P'])
    expect(capability.fields[0]?.defaultValue).toBe('1080P')
  })

  it('leaves the capability untouched without a usable expression', () => {
    const capability = videoCapability(['480P', '720P'])
    for (const overrides of [
      {},
      {
        billing_mode: 'tiered_expr' as const,
        billing_expr: 'tier("base", fixed(1))',
      },
      {
        billing_mode: 'tiered_expr' as const,
        billing_expr: 'tier("base", u("seconds") * u("seconds"))',
        billing_usage_schema: schema,
      },
    ]) {
      expect(restrictToPricedOptions(model(overrides), capability)).toBe(
        capability
      )
    }
  })

  it('keeps every option when all of them are priced', () => {
    const capability = videoCapability(['480P', '720P', '1080P'])
    expect(
      restrictToPricedOptions(
        model({
          billing_mode: 'tiered_expr',
          billing_expr:
            'u("resolution") == "1080P" ? tier("1080P", u("seconds") * 0.15) : u("resolution") == "720P" ? tier("720P", u("seconds") * 0.1) : tier("480P", u("seconds") * 0.05)',
          billing_usage_schema: schema,
        }),
        capability
      )
    ).toBe(capability)
  })
})
