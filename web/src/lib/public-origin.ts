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

function trimTrailingSlashes(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function isLoopbackUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase()
    return (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '::1' ||
      host === '[::1]' ||
      host.startsWith('127.')
    )
  } catch {
    return false
  }
}

/**
 * Resolves the origin to show in copy-paste samples such as curl commands.
 * An unset ServerAddress falls back to http://localhost:3000, which would be
 * copied verbatim by visitors of a public deployment, so a loopback address is
 * ignored when the page itself is served from a public host.
 */
export function resolvePublicOrigin(input: {
  serverAddress?: string
  pageOrigin?: string
  fallback?: string
}): string {
  const serverAddress = trimTrailingSlashes(input.serverAddress ?? '')
  const pageOrigin = trimTrailingSlashes(input.pageOrigin ?? '')
  if (
    serverAddress &&
    pageOrigin &&
    isLoopbackUrl(serverAddress) &&
    !isLoopbackUrl(pageOrigin)
  ) {
    return pageOrigin
  }
  return serverAddress || pageOrigin || input.fallback || 'https://example.com'
}
