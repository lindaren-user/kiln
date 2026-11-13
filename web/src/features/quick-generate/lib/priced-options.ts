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
import { getTaskPricingDisplayTiers } from '@/features/pricing/lib/task-matrix-display'
import type { PricingModel } from '@/features/pricing/types'

import type { ModelCapability } from './capabilities'

/**
 * Enum values of `field` that the model's expression gives a price to, e.g. the
 * resolutions whose tier is not zero. `null` means there is nothing to filter
 * on: the field is not a task usage enum, the expression is missing or could
 * not be understood, a priced fallback tier covers the values no condition
 * names, or every tier is zero — the caller then keeps the plugin's full option
 * list instead of guessing.
 */
export function pricedUsageValues(
  model: PricingModel,
  field: string,
  availableValues?: readonly string[]
): Set<string> | null {
  const usageSchema = model.billing_usage_schema
  if (!usageSchema?.[field]?.enum?.length) return null
  const schema = availableValues?.length
    ? {
        ...usageSchema,
        [field]: { ...usageSchema[field], enum: [...availableValues] },
      }
    : usageSchema
  const expression = model.billing_expr?.trim()
  if (!expression) return null
  const values = new Set<string>()
  for (const tier of getTaskPricingDisplayTiers(expression, schema)) {
    const priced =
      tier.constant > 0 ||
      Object.values(tier.unitPrices).some((price) => price > 0)
    if (!priced) continue
    // An unconditional tier is the fallback: it prices every value the tiers
    // above it did not name, so no option can be dropped.
    if (tier.conditions.length === 0) return null
    for (const condition of tier.conditions) {
      if (condition.field === field) values.add(condition.value)
    }
  }
  return values.size > 0 ? values : null
}

/**
 * Drops select options the model does not price, so the picker only offers
 * values that cost something. Fields whose options cannot be priced keep their
 * full list, and a priced default is replaced when it is filtered out.
 */
export function restrictToPricedOptions(
  model: PricingModel,
  capability: ModelCapability
): ModelCapability {
  let restricted = false
  const fields = capability.fields.map((field) => {
    const options = field.options
    if (field.type !== 'select' || !options?.length) return field
    const priced = pricedUsageValues(
      model,
      field.key,
      options.map((option) => option.value)
    )
    if (!priced) return field
    const kept = options.filter((option) => priced.has(option.value))
    if (kept.length === 0 || kept.length === options.length) return field
    restricted = true
    const defaultValue = kept.some(
      (option) => option.value === String(field.defaultValue)
    )
      ? field.defaultValue
      : kept[0].value
    return { ...field, options: kept, defaultValue }
  })
  return restricted ? { ...capability, fields } : capability
}
