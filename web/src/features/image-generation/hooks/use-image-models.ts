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

/**
 * Image-capable model names from the shared pricing cache, sorted by name and
 * paired with the option shape the selectors expect.
 */
export function useImageModels() {
  const pricing = usePricingData()

  const models = useMemo(
    () =>
      sortModels(
        filterByEndpointType(pricing.models, ENDPOINT_TYPES.IMAGE_GENERATION),
        SORT_OPTIONS.NAME
      ).map((model) => model.model_name),
    [pricing.models]
  )
  const items = useMemo(
    () => models.map((name) => ({ value: name, label: name })),
    [models]
  )

  return {
    models,
    items,
    isLoading: pricing.isLoading,
    error: pricing.error,
  }
}
