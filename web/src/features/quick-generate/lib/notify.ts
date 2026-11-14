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
import { t } from 'i18next'

import { getLogo } from '@/stores/system-config-store'

import type { Generation } from '../types'

/** One slot per page: a newer run replaces the notification of the older one. */
const NOTIFICATION_TAG = 'quick-generate'

function notificationTitle(generation: Generation) {
  if (generation.status === 'error') return t('Generation failed')
  if (generation.kind === 'video') return t('Your video is ready')
  return t('Your image is ready')
}

/**
 * Asks for the browser's notification permission while a user gesture still
 * allows it; browsers ignore the prompt otherwise. A denied or dismissed
 * answer is left alone, and the page simply never notifies.
 */
export function requestNotificationPermission() {
  if (!('Notification' in window)) return
  if (Notification.permission !== 'default') return
  void Notification.requestPermission()
}

/**
 * Reports a settled run the user may not have been looking at. The page shows
 * the result itself when it is visible, so it only notifies in the background;
 * clicking the notification brings the tab back.
 */
export function notifyGenerationFinished(generation: Generation) {
  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  if (!document.hidden) return
  const notification = new Notification(notificationTitle(generation), {
    body: generation.error ?? generation.prompt,
    tag: NOTIFICATION_TAG,
    icon: getLogo(),
  })
  notification.addEventListener(
    'click',
    () => {
      window.focus()
      notification.close()
    },
    { once: true }
  )
}
