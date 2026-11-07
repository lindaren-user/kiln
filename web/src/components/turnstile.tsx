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
import { useEffect, useRef } from 'react'

import { useTheme } from '@/context/theme-provider'
import { ensureTurnstile, type TurnstileApi } from '@/lib/turnstile'
import { cn } from '@/lib/utils'

interface TurnstileProps {
  siteKey: string
  onVerify: (token: string) => void
  onExpire?: () => void
  className?: string
}

/**
 * Cloudflare Turnstile widget.
 *
 * Rendered with `size: 'flexible'` so it spans the form column like the inputs
 * around it, and with the app's resolved theme so it does not stay a light box
 * in dark mode. The widget is removed before a re-render and on unmount, since
 * Cloudflare rejects rendering twice into the same container.
 */
export function Turnstile(props: TurnstileProps) {
  const { resolvedTheme } = useTheme()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | null>(null)
  const apiRef = useRef<TurnstileApi | null>(null)
  // Callbacks are read through a ref so an inline lambda at the call site does
  // not tear down and rebuild the widget on every render.
  const callbacksRef = useRef({
    onVerify: props.onVerify,
    onExpire: props.onExpire,
  })

  useEffect(() => {
    callbacksRef.current = {
      onVerify: props.onVerify,
      onExpire: props.onExpire,
    }
  })

  useEffect(() => {
    if (!props.siteKey) return

    let cancelled = false

    const removeWidget = () => {
      const api = apiRef.current
      if (!api || !widgetIdRef.current) return
      try {
        api.remove(widgetIdRef.current)
      } catch {
        // The widget may already be gone; nothing left to clean up.
      }
      widgetIdRef.current = null
    }

    ensureTurnstile()
      .then((api) => {
        const container = containerRef.current
        if (cancelled || !container) return
        apiRef.current = api
        removeWidget()
        try {
          widgetIdRef.current = api.render(container, {
            sitekey: props.siteKey,
            theme: resolvedTheme === 'dark' ? 'dark' : 'light',
            size: 'flexible',
            callback: (token: string) => callbacksRef.current.onVerify(token),
            'error-callback': () => callbacksRef.current.onExpire?.(),
            'expired-callback': () => callbacksRef.current.onExpire?.(),
          })
        } catch {
          // Widget initialisation failed (e.g. a domain the site key does not
          // allow); the form still renders and the server decides.
        }
      })
      .catch(() => {
        // The script is blocked or unreachable: same as above, the form still
        // renders and the server rejects the request if it must.
      })

    return () => {
      cancelled = true
      removeWidget()
    }
  }, [props.siteKey, resolvedTheme])

  return (
    <div
      ref={containerRef}
      className={cn('w-full [&_iframe]:w-full', props.className)}
    />
  )
}
