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
