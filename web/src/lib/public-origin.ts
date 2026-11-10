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

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

function hostnameOf(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function isLoopback(value: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostnameOf(value))
}

/**
 * The address API examples should call.
 *
 * `/api/status` reports `server_address` even when an administrator never set
 * it, because the backend keeps its `http://localhost:3000` default. A console
 * served from a public origin must not hand that default to its visitors, so a
 * loopback address yields to the page origin. Any other configured address
 * still wins, which keeps a console hosted apart from its API working.
 */
export function resolvePublicOrigin(
  serverAddress: unknown,
  pageOrigin: string = typeof window === 'undefined'
    ? ''
    : window.location.origin
): string {
  const configured =
    typeof serverAddress === 'string'
      ? serverAddress.trim().replace(/\/$/, '')
      : ''
  const page = pageOrigin.replace(/\/$/, '')
  if (configured && !(isLoopback(configured) && page && !isLoopback(page))) {
    return configured
  }
  return page || configured || 'https://api.example.com'
}
