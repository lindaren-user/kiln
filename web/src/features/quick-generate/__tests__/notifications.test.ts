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

import { capabilityFor } from '../lib/capabilities'
import {
  notifyGenerationFinished,
  requestNotificationPermission,
} from '../lib/notify'
import type { Generation } from '../types'

class FakeNotification {
  static permission: NotificationPermission = 'granted'
  static requestPermission = vi.fn(
    async (): Promise<NotificationPermission> => 'granted'
  )
  static instances: FakeNotification[] = []

  close = vi.fn()
  readonly title: string
  readonly options: NotificationOptions
  onClick: (() => void) | null = null

  constructor(title: string, options?: NotificationOptions) {
    this.title = title
    this.options = options ?? {}
    FakeNotification.instances.push(this)
  }

  addEventListener(type: string, listener: () => void) {
    if (type === 'click') this.onClick = listener
  }

  click() {
    this.onClick?.()
  }
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  })
}

function run(overrides: Partial<Generation> = {}): Generation {
  return {
    id: 'run-1',
    model: 'model-a',
    kind: 'image',
    capability: capabilityFor('image'),
    values: {},
    references: [],
    prompt: 'a red fox',
    status: 'done',
    media: [],
    saved: false,
    startedAt: Date.now(),
    ...overrides,
  }
}

describe('browser notifications', () => {
  function install(permission: NotificationPermission) {
    vi.stubGlobal('Notification', FakeNotification)
    FakeNotification.permission = permission
    FakeNotification.instances = []
    FakeNotification.requestPermission.mockClear()
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    FakeNotification.instances = []
    setHidden(false)
    vi.restoreAllMocks()
  })

  it('asks for permission only while the answer is still unknown', () => {
    install('default')
    requestNotificationPermission()
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1)

    FakeNotification.permission = 'denied'
    requestNotificationPermission()
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1)
  })

  it('reports a settled run while the tab is in the background', () => {
    install('granted')
    setHidden(true)

    notifyGenerationFinished(run())

    expect(FakeNotification.instances).toHaveLength(1)
    expect(FakeNotification.instances[0].title).toBe('Your image is ready')
    expect(FakeNotification.instances[0].options.body).toBe('a red fox')
  })

  it('names a finished video and an error by what happened', () => {
    install('granted')
    setHidden(true)

    notifyGenerationFinished(run({ kind: 'video' }))
    notifyGenerationFinished(run({ status: 'error', error: 'quota exceeded' }))

    expect(FakeNotification.instances.map((item) => item.title)).toEqual([
      'Your video is ready',
      'Generation failed',
    ])
    expect(FakeNotification.instances[1].options.body).toBe('quota exceeded')
  })

  it('stays quiet while the page is visible', () => {
    install('granted')
    setHidden(false)

    notifyGenerationFinished(run())

    expect(FakeNotification.instances).toHaveLength(0)
  })

  it('stays quiet without permission and without the API', () => {
    install('denied')
    setHidden(true)
    notifyGenerationFinished(run())
    expect(FakeNotification.instances).toHaveLength(0)

    vi.unstubAllGlobals()
    expect(() => notifyGenerationFinished(run())).not.toThrow()
    expect(() => requestNotificationPermission()).not.toThrow()
  })

  it('brings the tab back when the notification is clicked', () => {
    install('granted')
    setHidden(true)
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {})

    notifyGenerationFinished(run())
    FakeNotification.instances[0].click()

    expect(focus).toHaveBeenCalledTimes(1)
    expect(FakeNotification.instances[0].close).toHaveBeenCalledTimes(1)
  })
})
