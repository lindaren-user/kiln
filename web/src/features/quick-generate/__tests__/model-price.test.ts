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

import { generationModelPrice, generationRunPrice } from '../lib/model-price'

const t = (key: string) => key

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

describe('generation model price', () => {
  it('shows a per-request price', () => {
    expect(
      generationModelPrice(
        model({ quota_type: 1, model_price: 0.05 }),
        t,
        'en'
      )
    ).toBe('$0.05 / request')
  })

  it('shows a task usage price with the schema unit', () => {
    expect(
      generationModelPrice(
        model({
          billing_mode: 'tiered_expr',
          billing_expr: 'tier("base", u("count") * 0.1)',
          billing_usage_schema: {
            count: {
              type: 'number',
              unit: 'count',
              unitLabel: { en: 'generation', zh: '次' },
              description: {
                en: 'Video generation unit price',
                zh: '视频生成单价',
              },
            },
          },
        }),
        t,
        'zhCN'
      )
    ).toBe('$0.1 / 次')
  })

  it('shows token input and output prices', () => {
    expect(
      generationModelPrice(
        model({ model_ratio: 0.5, completion_ratio: 2 }),
        t,
        'en'
      )
    ).toBe('$1 Input · $2 Output')
  })

  it('omits a dynamic price that does not resolve to an amount', () => {
    expect(
      generationModelPrice(
        model({
          billing_mode: 'tiered_expr',
          billing_expr: 'tier("standard", p * 5)',
          model_ratio: 37.5,
        }),
        t,
        'en'
      )
    ).toBe('')
  })

  it('leaves the hint empty when a token model has no ratio', () => {
    expect(
      generationModelPrice(
        model({ model_ratio: Number.NaN, completion_ratio: Number.NaN }),
        t,
        'en'
      )
    ).toBe('')
  })

  it('prices one video run from the duration', () => {
    expect(
      generationRunPrice(
        model({
          billing_mode: 'tiered_expr',
          billing_expr: 'tier("base", u("seconds") * 0.2)',
          billing_usage_schema: {
            seconds: { type: 'number', unit: 'second' },
          },
        }),
        { seconds: 5 }
      )
    ).toBe('$1')
  })

  it('prices one image run from the requested count', () => {
    expect(
      generationRunPrice(
        model({ quota_type: 1, model_price: 0.05 }),
        { count: 4 }
      )
    ).toBe('$0.2')
  })

  it('leaves the hint empty when no price is configured', () => {
    expect(
      generationModelPrice(
        model({
          billing_usage_schema: {
            seconds: { type: 'number', unit: 'second' },
          },
        }),
        t,
        'en'
      )
    ).toBe('')
  })
})
