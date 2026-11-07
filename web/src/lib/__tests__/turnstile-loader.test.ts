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
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TURNSTILE_SCRIPT_ID } from '../turnstile'

const api = { render: vi.fn(() => 'widget-1'), remove: vi.fn() }

function scriptTag() {
  return document.getElementById(
    TURNSTILE_SCRIPT_ID
  ) as HTMLScriptElement | null
}

/** The loader memoises per module instance, so each case gets a fresh one. */
async function loadLoader() {
  vi.resetModules()
  return import('../turnstile')
}

afterEach(() => {
  delete window.turnstile
  scriptTag()?.remove()
  vi.clearAllMocks()
})

describe('ensureTurnstile', () => {
  it('injects the script once and resolves when it loads', async () => {
    const { ensureTurnstile } = await loadLoader()

    const loading = ensureTurnstile()
    expect(scriptTag()).not.toBeNull()
    expect(scriptTag()?.src).toContain('challenges.cloudflare.com')

    window.turnstile = api
    scriptTag()?.dispatchEvent(new Event('load'))

    await expect(loading).resolves.toBe(api)
  })

  it('shares one script between concurrent callers', async () => {
    const { ensureTurnstile } = await loadLoader()

    const first = ensureTurnstile()
    const second = ensureTurnstile()

    expect(document.querySelectorAll(`#${TURNSTILE_SCRIPT_ID}`)).toHaveLength(1)

    window.turnstile = api
    scriptTag()?.dispatchEvent(new Event('load'))

    await expect(Promise.all([first, second])).resolves.toEqual([api, api])
  })

  it('resolves immediately when the API is already on the page', async () => {
    window.turnstile = api
    const { ensureTurnstile } = await loadLoader()

    await expect(ensureTurnstile()).resolves.toBe(api)
    expect(scriptTag()).toBeNull()
  })

  it('rejects a failed load and retries with a fresh tag', async () => {
    const { ensureTurnstile } = await loadLoader()

    const failed = ensureTurnstile()
    scriptTag()?.dispatchEvent(new Event('error'))

    await expect(failed).rejects.toThrow('Turnstile failed to load')
    expect(scriptTag()).toBeNull()

    const retry = ensureTurnstile()
    const fresh = scriptTag()
    expect(fresh).not.toBeNull()

    window.turnstile = api
    fresh?.dispatchEvent(new Event('load'))

    await expect(retry).resolves.toBe(api)
  })
})
