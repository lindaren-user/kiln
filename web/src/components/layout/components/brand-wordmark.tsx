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
import type { BrandWordmark } from '@/config/brand'
import { useTheme } from '@/context/theme-provider'
import { cn } from '@/lib/utils'

type BrandWordmarkImageProps = {
  wordmark: BrandWordmark
  /** Height and spacing overrides; the mark keeps its aspect ratio. */
  className?: string
}

/**
 * Wordmark for the headers.
 *
 * Picks the variant the active theme needs instead of mounting both behind
 * `dark:` classes, so only one image is ever fetched. Decorative: the
 * surrounding link carries the accessible name.
 */
export function BrandWordmarkImage(props: BrandWordmarkImageProps) {
  const { resolvedTheme } = useTheme()
  const src =
    resolvedTheme === 'dark' ? props.wordmark.onDark : props.wordmark.onLight

  return (
    <img
      src={src}
      alt=''
      aria-hidden='true'
      className={cn('h-5 w-auto shrink-0', props.className)}
    />
  )
}
