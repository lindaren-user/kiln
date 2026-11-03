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
import type { ImageOption } from './types'

export const IMAGE_SIZE_ITEMS: ImageOption[] = [
  { value: '1024x1024', label: '1024 × 1024' },
  { value: '1024x1536', label: '1024 × 1536' },
  { value: '1536x1024', label: '1536 × 1024' },
  { value: '512x512', label: '512 × 512' },
]

export const IMAGE_COUNT_ITEMS: ImageOption[] = ['1', '2', '3', '4'].map(
  (count) => ({ value: count, label: count })
)

export const DEFAULT_IMAGE_SIZE = '1024x1024'

/** Long edge of the output, in pixels. */
export type ImageResolution = '1k' | '2k' | '4k'

export const IMAGE_RESOLUTION_ITEMS: ImageOption[] = [
  { value: '1k', label: '1K' },
  { value: '2k', label: '2K' },
  { value: '4k', label: '4K' },
]

export const DEFAULT_IMAGE_RESOLUTION: ImageResolution = '1k'

const LONG_EDGE: Record<ImageResolution, number> = {
  '1k': 1024,
  '2k': 2048,
  '4k': 4096,
}

export const IMAGE_RATIO_ITEMS: ImageOption[] = [
  { value: '1:1', label: '1:1' },
  { value: '2:3', label: '2:3' },
  { value: '3:2', label: '3:2' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '21:9', label: '21:9' },
  { value: '9:21', label: '9:21' },
  { value: 'auto', label: 'Auto' },
]

export const DEFAULT_IMAGE_RATIO = '1:1'

/**
 * Image APIs take concrete pixels, and the OpenAI-style image models only
 * accept a square and a 3:2 pair — `1536x1024` and `1024x1536` at 1K. Sending
 * an exact `1024x576` for 16:9 gets rejected upstream, so every ratio collapses
 * onto the nearest supported shape and the resolution only picks the scale.
 */
export function buildImageSize(
  ratio: string,
  resolution: ImageResolution
): string {
  if (ratio === 'auto') return 'auto'

  const [width, height] = ratio.split(':').map(Number)
  if (!width || !height) return DEFAULT_IMAGE_SIZE

  const longEdge = LONG_EDGE[resolution]
  if (width === height) return `${longEdge}x${longEdge}`

  const side = Math.round((longEdge * 3) / 2)
  return width > height ? `${side}x${longEdge}` : `${longEdge}x${side}`
}
