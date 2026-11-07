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
/** Which endpoint the model answers on: an image or a video generation. */
export type GenerationKind = 'image' | 'video'

export type GenerationStatus = 'running' | 'done' | 'error'

/** Parameter values keyed by the field key declared in the model capability. */
export type GenerationValues = Record<string, string>

export type GeneratedMedia = {
  url: string
  type: GenerationKind
}

export type ReferenceAttachment = {
  url: string
  mediaType: string
}

/**
 * What one request needs; also the recipe a retry replays. `values` holds the
 * fields the model's capability declared, so a different model can send a
 * different set of parameters without changing this type.
 */
export type GenerationParams = {
  model: string
  kind: GenerationKind
  values: GenerationValues
  /** Local attachments before upload, and temporary object URLs afterward. */
  references: ReferenceAttachment[]
}

/**
 * The single result on the page. A new generation replaces it, so `saved`
 * tracks whether the user already downloaded it — an unsaved result warns
 * before the page unloads.
 */
export type Generation = GenerationParams & {
  id: string
  prompt: string
  status: GenerationStatus
  media: GeneratedMedia[]
  saved: boolean
  /** Upstream progress text while a video task is running, e.g. `45%`. */
  progress?: string
  error?: string
}
