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
import { useQuery } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import { listEnabledApiKeys } from '../api'
import { loadSelectedApiKeyId, saveSelectedApiKeyId } from '../lib/selected-key'

/**
 * Enabled API keys plus the one the user picked, remembered across visits.
 *
 * A stored choice that no longer exists falls back to the first enabled key
 * without writing that fallback back to storage.
 */
export function useImageApiKeys() {
  const keysQuery = useQuery({
    queryKey: ['image-generation-keys'],
    queryFn: listEnabledApiKeys,
    staleTime: 5 * 60 * 1000,
  })
  const keys = keysQuery.data ?? []

  const [preferredKeyId, setPreferredKeyId] = useState<number | null>(() =>
    loadSelectedApiKeyId()
  )
  const selectedKeyId = keys.some((key) => key.id === preferredKeyId)
    ? preferredKeyId
    : (keys[0]?.id ?? null)

  const selectKey = useCallback((id: number) => {
    setPreferredKeyId(id)
    saveSelectedApiKeyId(id)
  }, [])

  return { keys, selectedKeyId, selectKey, isLoading: keysQuery.isLoading }
}
