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

import type { ImageResolution } from '@/features/image-generation/constants'

export type GenerationStatus = 'running' | 'done' | 'error'

/**
 * The single result on the page. A new generation replaces it, so `saved`
 * tracks whether the user already downloaded it — an unsaved result warns
 * before the page unloads.
 */
/** What one request needs; also the recipe a retry replays. */
export type GenerationParams = {
  model: string
  /** Aspect ratio as picked by the user, e.g. `16:9` or `auto`. */
  ratio: string
  resolution: ImageResolution
  count: number
}

export type Generation = GenerationParams & {
  id: string
  prompt: string
  status: GenerationStatus
  images: string[]
  saved: boolean
  error?: string
}
