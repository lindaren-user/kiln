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

export function mentionLabel(
  file: { filename?: string },
  fallback: string
): string {
  return `@${file.filename || fallback}`
}

/** A mention is a whole token: it starts and ends at a space or another @. */
const MENTION_EDGE = /[\s@]/

/**
 * Replaces every @file mention with the label for that reference's kind and
 * its position among the references of the same kind, so the prompt reads
 * "图片1", "音频1" instead of carrying local file names to the vendor. A file
 * mentioned twice keeps one number, and a mention with no matching file is
 * left alone.
 */
export function numberMentionTokens(
  text: string,
  files: { filename?: string; mediaType?: string }[],
  fallback: string,
  label: (kind: ReferenceKind, index: number) => string
): string {
  // Most prompts carry no mention; skip the map and the scan for those.
  if (!text.includes('@')) return text
  const labels = new Map<string, string>()
  const counts: Record<ReferenceKind, number> = {
    image: 0,
    audio: 0,
    video: 0,
    file: 0,
  }
  for (const file of files) {
    const kind = referenceKind(file)
    counts[kind] += 1
    const mention = mentionLabel(file, fallback)
    if (!labels.has(mention)) labels.set(mention, label(kind, counts[kind]))
  }
  if (labels.size === 0) return text
  // A shorter name that prefixes a longer one must not win the match.
  const mentions = [...labels.keys()].sort((a, b) => b.length - a.length)
  let out = ''
  let at = 0
  while (at < text.length) {
    if (text[at] === '@' && (at === 0 || MENTION_EDGE.test(text[at - 1]))) {
      const mention = mentions.find((candidate) =>
        text.startsWith(candidate, at)
      )
      const after = mention ? text[at + mention.length] : undefined
      if (mention && (after === undefined || MENTION_EDGE.test(after))) {
        out += labels.get(mention)
        at += mention.length
        continue
      }
    }
    out += text[at]
    at += 1
  }
  return out
}
