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
import { DEFAULT_LOGO } from '@/lib/constants'

/**
 * Static brand assets for this deployment.
 *
 * Headers show a wordmark instead of the square runtime logo while the `Logo`
 * option is the bundled mark (or left at its default). Any other logo keeps the
 * square icon plus the system name, so admin-configured branding still works.
 */
export type BrandWordmark = {
  /** Black glyph, used on light backgrounds. */
  onLight: string
  /** Amber glyph, used on dark backgrounds. */
  onDark: string
}

export const BRAND_WORDMARK: BrandWordmark = {
  onLight: '/kiln-wordmark-dark.webp',
  onDark: '/kiln-wordmark.webp',
}

const WORDMARK_LOGOS = new Set([DEFAULT_LOGO, '/kiln-logo.webp'])

/** Resolve the wordmark shown for a configured logo URL. */
export function getBrandWordmark(
  logo: string | undefined
): BrandWordmark | undefined {
  if (!logo) return BRAND_WORDMARK
  return WORDMARK_LOGOS.has(logo) ? BRAND_WORDMARK : undefined
}
