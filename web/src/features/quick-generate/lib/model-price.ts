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
import { evaluateBillingExpression } from '@/features/pricing/lib/billing-expression/runtime'
import {
  formatTaskUsageUnitPrice,
  getDynamicPriceUnitLabelKey,
  getDynamicPricingSummary,
  isUnconfiguredTaskUsageModel,
  type DynamicPriceEntry,
  type DynamicPriceOptions,
} from '@/features/pricing/lib/dynamic-price'
import { isTokenBasedModel } from '@/features/pricing/lib/model-helpers'
import { withFirstPricedVariant } from '@/features/pricing/lib/plugin-pricing'
import { formatPrice, formatRequestPrice } from '@/features/pricing/lib/price'
import {
  evaluateTaskUsageExamples,
  getTaskEnumFields,
} from '@/features/pricing/lib/task-expr'
import { taskUsageUnitLabel } from '@/features/pricing/lib/task-price-display'
import type { BillingUsageSchema, PricingModel } from '@/features/pricing/types'

import type { GenerationValues } from '../types'
import type { ModelCapability } from './capabilities'

/**
 * The duration a task plugin's usage examples describe. Token consumption grows
 * linearly with duration, so the estimate for a run is the matching example
 * scaled to the duration the composer would send.
 */
const USAGE_EXAMPLE_SECONDS = 5

/** One formatted price range; equal ends collapse and `-` means unpriceable. */
function formatPriceRange(
  low: number,
  high: number,
  options: DynamicPriceOptions
): string {
  const lowText = formatTaskUsageUnitPrice(low, options)
  if (lowText === '-') return ''
  if (low === high) return lowText
  const highText = formatTaskUsageUnitPrice(high, options)
  return highText === '-' ? '' : `${lowText} – ${highText}`
}

/**
 * Price range of one run across the plugin's usage examples. A token-priced
 * task model has no single unit price to show, so the menu hints at what the
 * sample generations it publishes cost.
 */
function examplePriceRange(
  model: PricingModel,
  options: DynamicPriceOptions
): string {
  const priced = withFirstPricedVariant(model)
  if (!priced) return ''
  const totals = evaluateTaskUsageExamples(
    priced.billing_expr,
    priced.billing_usage_schema,
    priced.billing_usage_examples
  )
    .map((row) => row.total)
    .filter((total) => Number.isFinite(total) && total > 0)
  if (totals.length === 0) return ''
  return formatPriceRange(Math.min(...totals), Math.max(...totals), options)
}

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
  const priceOptions: DynamicPriceOptions = {
    tokenUnit: 'M',
    priceRate,
    usdExchangeRate,
    showCurrencySymbol: true,
  }
  const dynamic = getDynamicPricingSummary(model, priceOptions)
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
    if (parts.length === 0) {
      // A token-priced task model: show what its sample runs cost instead of
      // one meaningless per-token figure.
      return examplePriceRange(model, priceOptions)
    }
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
  /** Usage facts for the parameters the page currently has selected. */
  usage?: Record<string, string | number>
}

/** Converts selected generation controls into the facts the billing expression expects. */
export function generationUsageFacts(
  schema: BillingUsageSchema | undefined,
  capability: ModelCapability,
  values: GenerationValues | undefined
): Record<string, string | number> | undefined {
  if (!schema || !values) return undefined
  const usage: Record<string, string | number> = {}
  for (const field of capability.fields) {
    const value = values[field.key]
    if (value === undefined || value === '' || !schema[field.key]) continue
    usage[field.key] =
      field.type === 'number' || field.valueType === 'number'
        ? Number(value)
        : value
  }
  // Images are billed by the top-level `n`, which the page names `count`.
  const count = values.count
  if (schema.image_count && count !== undefined && count !== '') {
    usage.image_count = Number(count)
  }
  // A video request always makes one video and the composer has no count
  // field, but the expression still reads u("count") for its unit price.
  if (schema.count && usage.count === undefined) {
    usage.count = count !== undefined && count !== '' ? Number(count) : 1
  }
  // The sample draft always renders at 480p and the plugin reports that tier,
  // whatever resolution the composer still holds.
  if (values.draft === 'true' && schema.resolution) {
    usage.resolution = '480p'
  }
  return Object.keys(usage).length > 0 ? usage : undefined
}

/**
 * Tokens for the selected parameters, estimated from the plugin's examples: the
 * example matching the chosen enum values is scaled to the selected duration.
 * Null when the model does not bill tokens or publishes no examples.
 */
function estimatedTokens(
  model: PricingModel,
  usage: Record<string, string | number> | undefined,
  seconds: number | undefined
): number | null {
  const schema = model.billing_usage_schema
  const examples = model.billing_usage_examples
  if (!schema?.tokens || !examples?.length) return null
  const enumFields = getTaskEnumFields(schema)
  const example = examples.find((item) =>
    enumFields.every(([field]) => {
      const selected = usage?.[field]
      return selected === undefined || item.facts[field] === selected
    })
  )
  const tokens = Number(example?.facts.tokens)
  if (!Number.isFinite(tokens) || tokens <= 0) return null
  const duration = seconds && seconds > 0 ? seconds : USAGE_EXAMPLE_SECONDS
  return (tokens * duration) / USAGE_EXAMPLE_SECONDS
}

/**
 * The exact price of the selected parameters for a task model, or null when
 * the expression cannot be evaluated here (no usage facts, a fixed price, or a
 * dependency on request headers). Callers then fall back to the tier range.
 */
function exactTaskPrice(
  model: PricingModel,
  usage: Record<string, string | number> | undefined,
  priceRate: number,
  usdExchangeRate: number
): string | null {
  const expression = model.billing_expr?.trim()
  if (!usage || !expression || !model.billing_usage_schema) return null
  // A task expression returns USD, but fixed() is scaled for token expressions
  // and is rejected upstream for task usage, so it never evaluates here.
  if (expression.includes('fixed(')) return null
  const result = evaluateBillingExpression(expression, { usage })
  if (result.status !== 'success' || !(result.cost > 0)) return null
  const formatted = formatTaskUsageUnitPrice(result.cost, {
    tokenUnit: 'M',
    priceRate,
    usdExchangeRate,
    showCurrencySymbol: true,
  })
  return formatted === '-' ? null : formatted
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
  // A token-priced model has no tokens in the composer facts; the run's
  // estimate comes from the plugin's example for the selected parameters.
  const usage = quantities.usage ? { ...quantities.usage } : undefined
  if (usage && usage.tokens === undefined) {
    const tokens = estimatedTokens(model, usage, quantities.seconds)
    if (tokens !== null) usage.tokens = Math.round(tokens)
  }
  const exact = exactTaskPrice(
    model,
    usage,
    priceRate,
    usdExchangeRate
  )
  if (exact !== null) return exact
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
    return formatPriceRange(low, high, {
      tokenUnit: 'M',
      priceRate,
      usdExchangeRate,
      showCurrencySymbol: true,
    })
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
