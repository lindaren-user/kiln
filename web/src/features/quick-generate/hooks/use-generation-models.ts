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
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { ENDPOINT_TYPES, SORT_OPTIONS } from '@/features/pricing/constants'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import {
  filterByEndpointType,
  sortModels,
} from '@/features/pricing/lib/filters'
import type { PricingModel } from '@/features/pricing/types'

import type { ModelCapability } from '../lib/capabilities'
import {
  generationModelPrice,
  generationRunPrice,
  type GenerationRunQuantity,
} from '../lib/model-price'
import { restrictToPricedOptions } from '../lib/priced-options'
import type { GenerationKind, GenerationValues } from '../types'

/**
 * The usage facts the selected controls produce, so the run price reflects the
 * chosen resolution instead of the cheapest to the dearest tier.
 */
function usageFrom(
  model: PricingModel,
  capability: ModelCapability,
  values: GenerationValues | undefined
): Record<string, string | number> | undefined {
  const schema = model.billing_usage_schema
  if (!schema || !values) return undefined
  const usage: Record<string, string | number> = {}
  for (const field of capability.fields) {
    const value = values[field.key]
    if (value === undefined || value === '' || !schema[field.key]) continue
    usage[field.key] = field.type === 'number' ? Number(value) : value
  }
  // Images are billed by the top-level `n`, which the page names `count`.
  const count = values.count
  if (schema.image_count && count !== undefined && count !== '') {
    usage.image_count = Number(count)
  }
  return Object.keys(usage).length > 0 ? usage : undefined
}

export type GenerationModel = {
  name: string
  kind: GenerationKind
  capability: ModelCapability
}

type ListedModel = GenerationModel & { source: PricingModel }

function modelsFor(
  models: PricingModel[],
  endpointType: string,
  kind: GenerationKind
): ListedModel[] {
  return sortModels(
    filterByEndpointType(models, endpointType),
    SORT_OPTIONS.NAME
  ).map((model) => ({
    name: model.model_name,
    kind,
    capability: restrictToPricedOptions(model, {
      kind,
      fields: model.generation_schemas?.[kind]?.fields ?? [],
      referenceImages:
        model.generation_schemas?.[kind]?.referenceImages ?? null,
      mediaNotice: model.generation_schemas?.[kind]?.mediaNotice ?? false,
    }),
    source: model,
  }))
}

/**
 * Every model this page can call, tagged with the endpoint it answers on.
 * Image models come first because they were the page's original scope; a name
 * configured on both endpoints keeps its image entry.
 */
export function useGenerationModels() {
  const pricing = usePricingData()
  const { t, i18n } = useTranslation()

  const listed = useMemo<ListedModel[]>(() => {
    const images = modelsFor(
      pricing.models,
      ENDPOINT_TYPES.IMAGE_GENERATION,
      'image'
    )
    const videos = modelsFor(
      pricing.models,
      ENDPOINT_TYPES.OPENAI_VIDEO,
      'video'
    )
    const taken = new Set(images.map((model) => model.name))

    return [...images, ...videos.filter((model) => !taken.has(model.name))]
  }, [pricing.models])

  const models = useMemo<GenerationModel[]>(
    () =>
      listed.map(({ name, kind, capability }) => ({
        name,
        kind,
        capability,
      })),
    [listed]
  )

  const items = useMemo(
    () =>
      listed.map((model) => ({
        value: model.name,
        label: model.name,
        hint: generationModelPrice(
          model.source,
          t,
          i18n.resolvedLanguage || i18n.language,
          pricing.priceRate,
          pricing.usdExchangeRate
        ),
        title: model.source.description?.trim() || undefined,
      })),
    [
      i18n.language,
      i18n.resolvedLanguage,
      listed,
      pricing.priceRate,
      pricing.usdExchangeRate,
      t,
    ]
  )

  const descriptionFor = useCallback(
    (name: string) => {
      const description = listed.find((item) => item.name === name)?.source
        .description
      return description?.trim() ?? ''
    },
    [listed]
  )

  const priceForRun = useCallback(
    (
      name: string,
      quantities: GenerationRunQuantity,
      values?: GenerationValues
    ) => {
      const model = listed.find((item) => item.name === name)
      if (!model) return ''
      return generationRunPrice(
        model.source,
        {
          ...quantities,
          usage: usageFrom(model.source, model.capability, values),
        },
        pricing.priceRate,
        pricing.usdExchangeRate
      )
    },
    [listed, pricing.priceRate, pricing.usdExchangeRate]
  )

  return {
    models,
    items,
    descriptionFor,
    priceForRun,
    isLoading: pricing.isLoading,
    error: pricing.error,
  }
}
