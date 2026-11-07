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
  formatTaskUsageUnitPrice,
  getDynamicPriceUnitLabelKey,
  getDynamicPricingSummary,
  isUnconfiguredTaskUsageModel,
  type DynamicPriceEntry,
} from '@/features/pricing/lib/dynamic-price'
import { isTokenBasedModel } from '@/features/pricing/lib/model-helpers'
import { formatPrice, formatRequestPrice } from '@/features/pricing/lib/price'
import { taskUsageUnitLabel } from '@/features/pricing/lib/task-price-display'
import type { PricingModel } from '@/features/pricing/types'

/**
 * One short price for the model menu. Empty when the catalog has no price.
 * The closed control keeps the model name; this string is only the menu hint.
 */
export function generationModelPrice(
  model: PricingModel,
  t: (key: string) => string,
  language: string,
  priceRate = 1,
  usdExchangeRate = 1
): string {
  const dynamic = getDynamicPricingSummary(model, {
    tokenUnit: 'M',
    priceRate,
    usdExchangeRate,
    showCurrencySymbol: true,
  })
  if (dynamic?.isSpecialExpression) return t('Special billing expression')
  if (dynamic) {
    const parts = dynamic.primaryEntries.slice(0, 2).flatMap((entry) => {
      // Token formulas such as `p * 5` are not a price for one generation.
      if (entry.unit === 'token') return []
      const amount = entry.formattedRange ?? entry.formatted
      if (!amount || amount === '-' || amount === '- – -') return []
      const unitKey =
        entry.unit === 'request' ? 'call' : getDynamicPriceUnitLabelKey(entry)
      const unit = taskUsageUnitLabel(
        entry,
        language,
        unitKey ? t(unitKey) : ''
      )
      return [unit ? `${amount} / ${unit}` : amount]
    })
    return parts.join(' · ')
  }
  if (isUnconfiguredTaskUsageModel(model)) return ''
  if (isTokenBasedModel(model)) {
    if (!Number.isFinite(model.model_ratio)) return ''
    const input = formatPrice(
      model,
      'input',
      'M',
      false,
      priceRate,
      usdExchangeRate
    )
    const output = formatPrice(
      model,
      'output',
      'M',
      false,
      priceRate,
      usdExchangeRate
    )
    if (input === '-' || output === '-') return ''
    return `${input} ${t('Input')} · ${output} ${t('Output')}`
  }
  if (!Number.isFinite(model.model_price)) return ''
  const request = formatRequestPrice(model, false, priceRate, usdExchangeRate)
  if (request === '-') return ''
  return `${request} / ${t('call')}`
}

export type GenerationRunQuantity = {
  seconds?: number
  count?: number
}

function runFactor(
  unit: DynamicPriceEntry['unit'],
  quantities: GenerationRunQuantity,
  scaleRequest: boolean
): number | null {
  switch (unit) {
    case 'second':
      return quantities.seconds && quantities.seconds > 0
        ? quantities.seconds
        : null
    case 'count':
    case 'image':
      if (quantities.count === undefined) return 1
      return quantities.count > 0 ? quantities.count : null
    case 'request':
      if (!scaleRequest) return 1
      if (quantities.count === undefined) return 1
      return quantities.count > 0 ? quantities.count : null
    default:
      return null
  }
}

/**
 * Price of one generation with the quantities the page will send.
 * Empty when the catalog has no price that those quantities can scale.
 */
export function generationRunPrice(
  model: PricingModel,
  quantities: GenerationRunQuantity,
  priceRate = 1,
  usdExchangeRate = 1
): string {
  const dynamic = getDynamicPricingSummary(model, {
    tokenUnit: 'M',
    priceRate,
    usdExchangeRate,
    showCurrencySymbol: true,
  })
  if (dynamic?.isSpecialExpression) return ''
  if (dynamic) {
    const scaleRequest = !dynamic.primaryEntries.some(
      (entry) =>
        entry.unit === 'second' ||
        entry.unit === 'count' ||
        entry.unit === 'image'
    )
    let low = 0
    let high = 0
    let priced = 0
    for (const entry of dynamic.primaryEntries) {
      const factor = runFactor(entry.unit, quantities, scaleRequest)
      if (factor === null) continue
      const entryLow = entry.minValue ?? entry.value
      const entryHigh = entry.maxValue ?? entry.value
      if (!Number.isFinite(entryLow) || !Number.isFinite(entryHigh)) continue
      if (entryLow < 0 || entryHigh < 0) continue
      low += entryLow * factor
      high += entryHigh * factor
      priced += 1
    }
    if (priced === 0) return ''
    const options = {
      tokenUnit: 'M' as const,
      priceRate,
      usdExchangeRate,
      showCurrencySymbol: true,
    }
    const lowText = formatTaskUsageUnitPrice(low, options)
    if (lowText === '-') return ''
    if (low === high) return lowText
    const highText = formatTaskUsageUnitPrice(high, options)
    if (highText === '-') return ''
    return `${lowText} – ${highText}`
  }
  if (isUnconfiguredTaskUsageModel(model) || isTokenBasedModel(model)) return ''
  const unitPrice = model.model_price
  if (typeof unitPrice !== 'number' || !Number.isFinite(unitPrice)) return ''
  const count = quantities.count && quantities.count > 0 ? quantities.count : 1
  const total = formatRequestPrice(
    { ...model, model_price: unitPrice * count },
    false,
    priceRate,
    usdExchangeRate
  )
  return total === '-' ? '' : total
}
