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
import { useMemo } from 'react'

import { ENDPOINT_TYPES, SORT_OPTIONS } from '@/features/pricing/constants'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import {
  filterByEndpointType,
  sortModels,
} from '@/features/pricing/lib/filters'
import type { PricingModel } from '@/features/pricing/types'

import type { GenerationKind } from '../types'

export type GenerationModel = {
  name: string
  kind: GenerationKind
}

function namesFor(models: PricingModel[], endpointType: string): string[] {
  return sortModels(
    filterByEndpointType(models, endpointType),
    SORT_OPTIONS.NAME
  ).map((model) => model.model_name)
}

/**
 * Every model this page can call, tagged with the endpoint it answers on.
 * Image models come first because they were the page's original scope; a name
 * configured on both endpoints keeps its image entry.
 */
export function useGenerationModels() {
  const pricing = usePricingData()

  const models = useMemo<GenerationModel[]>(() => {
    const images = namesFor(pricing.models, ENDPOINT_TYPES.IMAGE_GENERATION)
    const videos = namesFor(pricing.models, ENDPOINT_TYPES.OPENAI_VIDEO)
    const taken = new Set(images)

    return [
      ...images.map((name) => ({ name, kind: 'image' as const })),
      ...videos
        .filter((name) => !taken.has(name))
        .map((name) => ({ name, kind: 'video' as const })),
    ]
  }, [pricing.models])

  const items = useMemo(
    () => models.map((model) => ({ value: model.name, label: model.name })),
    [models]
  )

  return {
    models,
    items,
    isLoading: pricing.isLoading,
    error: pricing.error,
  }
}
