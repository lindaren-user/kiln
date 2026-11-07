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
import { readStoredJson, stringValues, writeStoredJson } from './stored-json'
import type { GenerationValues } from '../types'

/** Prompt, chosen model and its parameters: the composer's unsent work. */
export type ComposerDraft = {
  prompt: string
  model: string
  values: GenerationValues
}

const COMPOSER_DRAFT_STORAGE_KEY = 'kiln:quick-generate:draft:v1'

const EMPTY_DRAFT: ComposerDraft = { prompt: '', model: '', values: {} }

/** The draft of the previous visit; an entry of another shape starts empty. */
export function loadComposerDraft(): ComposerDraft {
  const raw = readStoredJson(COMPOSER_DRAFT_STORAGE_KEY)
  if (typeof raw !== 'object' || raw === null) return EMPTY_DRAFT
  const record = raw as Record<string, unknown>
  return {
    prompt: typeof record.prompt === 'string' ? record.prompt : '',
    model: typeof record.model === 'string' ? record.model : '',
    values: stringValues(record.values),
  }
}

export function saveComposerDraft(draft: ComposerDraft): void {
  writeStoredJson(COMPOSER_DRAFT_STORAGE_KEY, draft)
}
