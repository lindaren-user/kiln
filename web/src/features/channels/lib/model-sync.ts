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

/**
 * Compares a channel's model list with the list its upstream publishes.
 *
 * `missing` holds models the channel lists that the upstream no longer serves.
 * A model still counts as served when `modelMapping` redirects it to a listed
 * name. `added` holds upstream models the channel does not list yet, in
 * upstream order; a name a redirect already reaches is not new. Matching
 * ignores case.
 */
export function compareChannelModels(
  models: string[],
  upstream: string[],
  modelMapping?: string
): { missing: string[]; added: string[] } {
  const listed = new Set(upstream.map((model) => model.toLowerCase()))
  const redirects = parseRedirects(modelMapping)

  const owned = new Set(models.map((model) => model.toLowerCase()))
  for (const [from, targets] of redirects) {
    if (!owned.has(from)) continue
    for (const target of targets) owned.add(target.toLowerCase())
  }

  const missing = models.filter((model) => {
    const name = model.toLowerCase()
    if (listed.has(name)) return false
    const targets = redirects.get(name) ?? []
    return !targets.some((target) => listed.has(target.toLowerCase()))
  })
  const added = upstream.filter((model) => !owned.has(model.toLowerCase()))
  return { missing, added }
}

function parseRedirects(modelMapping?: string): Map<string, string[]> {
  const redirects = new Map<string, string[]>()
  if (!modelMapping?.trim()) return redirects
  let parsed: unknown
  try {
    parsed = JSON.parse(modelMapping)
  } catch {
    return redirects
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return redirects
  }
  for (const [from, to] of Object.entries(parsed)) {
    const targets = (Array.isArray(to) ? to : [to]).filter(
      (target): target is string => typeof target === 'string'
    )
    redirects.set(from.toLowerCase(), targets)
  }
  return redirects
}
