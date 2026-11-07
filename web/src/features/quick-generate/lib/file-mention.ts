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

export type MentionFile = {
  id: string
  filename?: string
  url?: string
  mediaType?: string
}

export type ReferenceKind = 'image' | 'audio' | 'video' | 'file'

const EXTENSION_KINDS: [RegExp, ReferenceKind][] = [
  [/\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i, 'image'],
  [/\.(mp3|wav|m4a|aac|ogg|oga|flac|opus|amr)$/i, 'audio'],
  [/\.(mp4|m4v|webm|mov|mkv|avi)$/i, 'video'],
]

/**
 * What a reference is. Browsers report an empty or wrong MIME type for some
 * picked files, so the extension decides audio and video before the type
 * does; everything else follows the type, then falls back to a plain file.
 */
export function referenceKind(file: {
  filename?: string
  mediaType?: string
}): ReferenceKind {
  const name = file.filename ?? ''
  for (const [pattern, kind] of EXTENSION_KINDS) {
    if (pattern.test(name)) return kind
  }
  const type = (file.mediaType ?? '').toLowerCase()
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('video/')) return 'video'
  return 'file'
}

/** Accept-rule prefixes ("image/*") as kinds the selection permits. */
export function acceptedReferenceKinds(accept: string): Set<ReferenceKind> {
  const kinds = new Set<ReferenceKind>()
  for (const rule of accept.split(',')) {
    const trimmed = rule.trim().toLowerCase()
    if (!trimmed.endsWith('/*')) continue
    const kind = trimmed.slice(0, -2)
    if (kind === 'image' || kind === 'audio' || kind === 'video') {
      kinds.add(kind)
    }
  }
  return kinds
}

/** The @ query touching the caret. Null when the caret is not inside one. */
export function activeMentionQuery(textBeforeCaret: string): string | null {
  const match = /(?:^|\s)@([^\s@]*)$/.exec(textBeforeCaret)
  if (!match) return null
  return match[1] ?? ''
}

/** Index of the @ that opens the query, or -1. */
export function mentionMark(textBeforeCaret: string): number {
  if (activeMentionQuery(textBeforeCaret) === null) return -1
  return textBeforeCaret.lastIndexOf('@')
}

export function filterMentionFiles(
  files: MentionFile[],
  query: string
): MentionFile[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return files
  return files.filter((file) =>
    (file.filename ?? '').toLowerCase().includes(needle)
  )
}

export function mentionLabel(file: MentionFile, fallback: string): string {
  return `@${file.filename || fallback}`
}
