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

import { resolvePublicOrigin } from '@/lib/public-origin'

function trimTrailingSlashes(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

/** Ignore a loopback ServerAddress when the docs page is opened on a public host. */
export function resolveDocsSiteOrigin(input: {
  serverAddress?: string
  pageOrigin?: string
}): string {
  return resolvePublicOrigin(input)
}

export function docsOpenAIBaseUrl(siteOrigin: string): string {
  const origin = trimTrailingSlashes(siteOrigin)
  if (/\/v1$/i.test(origin)) return origin
  return `${origin}/v1`
}
