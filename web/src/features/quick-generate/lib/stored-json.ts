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
import type { GenerationValues } from '../types'

/**
 * The quick-generate records live in localStorage, which holds text only and
 * can be full or disabled. These helpers keep the failure policy in one place:
 * a missing or unreadable entry reads as `null`, and a failed write costs only
 * the stored copy.
 */
export function readStoredJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function writeStoredJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // A full or disabled storage only loses the stored copy.
  }
}

export function removeStoredJson(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Nothing to recover: the record is gone from view either way.
  }
}

/**
 * The string entries of a stored parameter map. Anything else is dropped, so a
 * hand-edited or outdated entry cannot put a non-string into a request.
 */
export function stringValues(raw: unknown): GenerationValues {
  if (typeof raw !== 'object' || raw === null) return {}
  const values: GenerationValues = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') values[key] = value
  }
  return values
}
