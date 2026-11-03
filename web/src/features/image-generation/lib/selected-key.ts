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

/** Kept at the original key so an existing picker choice survives. */
const SELECTED_KEY_STORAGE_KEY = 'kiln:canvas:api-key:v1'

export function loadSelectedApiKeyId(): number | null {
  try {
    const raw = window.localStorage.getItem(SELECTED_KEY_STORAGE_KEY)
    if (!raw) return null
    const id = Number(raw)
    return Number.isFinite(id) ? id : null
  } catch {
    return null
  }
}

export function saveSelectedApiKeyId(id: number): void {
  try {
    window.localStorage.setItem(SELECTED_KEY_STORAGE_KEY, String(id))
  } catch {
    // Ignore storage failures; the selection still applies to this session.
  }
}
