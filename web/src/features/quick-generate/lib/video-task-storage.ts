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
import {
  readStoredJson,
  removeStoredJson,
  stringValues,
  writeStoredJson,
} from './stored-json'
import type { ModelCapability } from './capabilities'
import type { Generation, ReferenceAttachment } from '../types'

/**
 * The generation a video task left behind, kept so a reload can show the run
 * again and poll it from its task id. The key itself is never stored: polling
 * resolves it from the key id the console already remembers.
 */
export type RunningVideoTask = Generation & {
  taskId: string
  /** The key the task was submitted with, so polling needs no new selection. */
  keyId: number
}

const RUNNING_VIDEO_TASK_STORAGE_KEY = 'kiln:quick-generate:video-task:v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Storage is untrusted; an entry without a task to poll cannot be resumed. */
function normalizeRunningTask(raw: unknown): RunningVideoTask | null {
  if (!isRecord(raw)) return null
  if (typeof raw.id !== 'string' || typeof raw.taskId !== 'string') return null
  if (!raw.taskId || typeof raw.keyId !== 'number') return null
  if (typeof raw.model !== 'string' || typeof raw.prompt !== 'string') {
    return null
  }
  if (!isRecord(raw.capability)) return null
  const references = Array.isArray(raw.references)
    ? raw.references.filter(
        (item): item is ReferenceAttachment =>
          isRecord(item) && typeof item.url === 'string'
      )
    : []
  return {
    id: raw.id,
    taskId: raw.taskId,
    keyId: raw.keyId,
    model: raw.model,
    prompt: raw.prompt,
    capability: raw.capability as unknown as ModelCapability,
    values: stringValues(raw.values),
    references,
    draftTaskId:
      typeof raw.draftTaskId === 'string' ? raw.draftTaskId : undefined,
    // An older record has no start time; its clock starts at the reload.
    startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : Date.now(),
    // A stored task is by definition one still waiting for its poll.
    kind: 'video',
    status: 'running',
    media: [],
    saved: false,
    progress: typeof raw.progress === 'string' ? raw.progress : undefined,
  }
}

/** The video task of the previous visit, if it is still waiting for a poll. */
export function loadRunningVideoTask(): RunningVideoTask | null {
  return normalizeRunningTask(readStoredJson(RUNNING_VIDEO_TASK_STORAGE_KEY))
}

export function saveRunningVideoTask(task: RunningVideoTask): void {
  writeStoredJson(RUNNING_VIDEO_TASK_STORAGE_KEY, task)
}

export function clearRunningVideoTask(): void {
  removeStoredJson(RUNNING_VIDEO_TASK_STORAGE_KEY)
}
