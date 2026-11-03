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
function saveHref(href: string, filename: string) {
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/**
 * Save an image or video to the device. Remote URLs are fetched first because
 * browsers ignore the `download` attribute on cross-origin links. Returns
 * false when the fetch is blocked (usually CORS) so the caller can open the
 * media in a tab instead.
 */
export async function downloadMedia(
  url: string,
  filename: string
): Promise<boolean> {
  // Inline base64 results are already local, so there is nothing to fetch.
  if (url.startsWith('data:')) {
    saveHref(url, filename)
    return true
  }

  try {
    const response = await fetch(url)
    if (!response.ok) return false
    const objectUrl = URL.createObjectURL(await response.blob())
    saveHref(objectUrl, filename)
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    return true
  } catch {
    return false
  }
}

const EXTENSIONS = /\.(png|jpe?g|webp|gif|mp4|webm|mov|m4v)(?:\?|$)/i

/** `kiln-<timestamp>-<index>.<ext>` — from the URL, else the caller's type. */
export function mediaFilename(
  url: string,
  index: number,
  fallback = 'png'
): string {
  const match = EXTENSIONS.exec(url)
  const extension = match ? match[1].toLowerCase() : fallback
  return `kiln-${Date.now()}-${index + 1}.${extension}`
}
