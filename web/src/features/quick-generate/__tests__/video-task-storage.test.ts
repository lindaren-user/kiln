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
import { beforeEach, describe, expect, it } from 'vitest'

import { capabilityFor } from '../lib/capabilities'
import {
  clearRunningVideoTask,
  loadRunningVideoTask,
  saveRunningVideoTask,
  type RunningVideoTask,
} from '../lib/video-task-storage'

const TASK: RunningVideoTask = {
  id: 'run-1',
  taskId: 'task-1',
  keyId: 7,
  model: 'sora-2',
  kind: 'video',
  prompt: 'a kiln at dusk',
  values: { seconds: '5' },
  capability: capabilityFor('video', { fields: [] }),
  references: [
    { url: 'https://cdn.example.com/frame.png', mediaType: 'image/png' },
  ],
  status: 'running',
  media: [],
  saved: false,
  startedAt: 1_700_000_000_000,
  progress: '40%',
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('running video task storage', () => {
  it('brings back the task a reload has to rejoin', () => {
    saveRunningVideoTask(TASK)

    expect(loadRunningVideoTask()).toEqual(TASK)
  })

  it('always comes back as a run still waiting for its poll', () => {
    saveRunningVideoTask(TASK)

    expect(loadRunningVideoTask()).toMatchObject({
      kind: 'video',
      status: 'running',
      media: [],
      saved: false,
    })
  })

  it('starts the clock at the reload for a record without a start time', () => {
    const { startedAt: _startedAt, ...legacy } = TASK
    window.localStorage.setItem(
      'kiln:quick-generate:video-task:v1',
      JSON.stringify(legacy)
    )

    expect(loadRunningVideoTask()?.startedAt).toBeTypeOf('number')
  })

  it('refuses an entry that has no task to poll', () => {
    window.localStorage.setItem(
      'kiln:quick-generate:video-task:v1',
      JSON.stringify({ id: 'run-1', model: 'sora-2' })
    )

    expect(loadRunningVideoTask()).toBeNull()
  })

  it('forgets the task once it settles', () => {
    saveRunningVideoTask(TASK)

    clearRunningVideoTask()

    expect(loadRunningVideoTask()).toBeNull()
  })
})
