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

export type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

/** Id of the injected tag; shared with tests that simulate a slow load. */
export const TURNSTILE_SCRIPT_ID = 'cf-turnstile'
const SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let pending: Promise<TurnstileApi> | null = null

/**
 * Load Cloudflare Turnstile once per session.
 *
 * Every caller shares one promise, so a widget that mounts while the script is
 * still downloading waits for the same load instead of racing it or injecting a
 * second tag. A failed load clears the memo so the next mount can retry.
 */
export function ensureTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (pending) return pending

  pending = new Promise<TurnstileApi>((resolve, reject) => {
    let script = document.getElementById(
      TURNSTILE_SCRIPT_ID
    ) as HTMLScriptElement | null
    if (!script) {
      script = document.createElement('script')
      script.id = TURNSTILE_SCRIPT_ID
      script.src = SCRIPT_SRC
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }

    const fail = () => {
      // Drop the dead tag so a later mount can inject a fresh one.
      script?.remove()
      reject(new Error('Turnstile failed to load'))
    }
    const resolveApi = () => {
      if (window.turnstile) {
        resolve(window.turnstile)
        return
      }
      fail()
    }

    script.addEventListener('load', resolveApi, { once: true })
    script.addEventListener('error', fail, { once: true })
    // The script may have finished loading before the listeners were attached.
    if (window.turnstile) resolveApi()
  })

  pending.catch(() => {
    pending = null
  })

  return pending
}
