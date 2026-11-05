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

import { capabilityModelName } from '../lib/capabilities'
import {
  generationModelPrice,
  generationRunPrice,
  type GenerationRunQuantity,
} from '../lib/model-price'
import type { GenerationKind } from '../types'

export type GenerationModel = {
  name: string
  kind: GenerationKind
  /** Upstream model when a channel mapping renames the published model. */
  parameterModel: string
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
    parameterModel: capabilityModelName(model.model_name, model.upstream_model),
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
      listed.map(({ name, kind, parameterModel }) => ({
        name,
        kind,
        parameterModel,
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
    (name: string, quantities: GenerationRunQuantity) => {
      const source = listed.find((item) => item.name === name)?.source
      if (!source) return ''
      return generationRunPrice(
        source,
        quantities,
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
