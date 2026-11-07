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
import { FileIcon, Loader2, Mic, Video, X, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { usePromptInputAttachments } from '@/components/ai-elements/prompt-input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { downloadMedia } from '../lib/download-media'
import {
  activeMentionQuery,
  filterMentionFiles,
  mentionLabel,
  mentionMark,
  referenceKind,
  type MentionFile,
  type ReferenceKind,
} from '../lib/file-mention'
import { MediaLightbox, type MediaKind } from './media-lightbox'

type PromptMentionInputProps = {
  /** Cleared by the parent after a prompt is accepted. */
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  disabled?: boolean
  /** Reference media is uploading; chips show a spinner instead of a status. */
  uploading?: boolean
}

const CHIP_CLASS =
  'bg-accent text-accent-foreground mx-0.5 inline-flex max-w-48 min-w-0 items-center gap-1 overflow-hidden rounded-md px-1.5 py-0.5 align-baseline text-xs font-medium'

function readPrompt(root: HTMLElement): string {
  let text = ''
  for (const node of root.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? ''
      continue
    }
    if (!(node instanceof HTMLElement)) continue
    if (node.dataset.mentionLabel) {
      text += node.dataset.mentionLabel
      continue
    }
    if (node.tagName === 'BR') {
      text += '\n'
      continue
    }
    text += readPrompt(node)
  }
  return text
}

/** Prompt text. An emptied contenteditable keeps a lone break, which is not text. */
function editorPrompt(root: HTMLElement): string {
  const text = readPrompt(root)
  const blank = text.replaceAll('\n', '') === ''
  if (blank && !root.querySelector('[data-mention-id]')) return ''
  return text
}

function textBeforeCaret(root: HTMLElement): string {
  const selection = window.getSelection()
  if (
    !selection ||
    selection.rangeCount === 0 ||
    !root.contains(selection.anchorNode)
  ) {
    return readPrompt(root)
  }
  const range = selection.getRangeAt(0).cloneRange()
  range.selectNodeContents(root)
  range.setEnd(selection.anchorNode ?? root, selection.anchorOffset)
  const holder = document.createElement('div')
  holder.append(range.cloneContents())
  return readPrompt(holder)
}

const KIND_ICONS: Record<ReferenceKind, LucideIcon> = {
  image: FileIcon,
  audio: Mic,
  video: Video,
  file: FileIcon,
}

/** A reference's thumbnail: the image itself, an icon for other media. */
function ReferenceThumbnail(props: { file: MentionFile }) {
  const kind = referenceKind(props.file)
  if (kind === 'image' && props.file.url) {
    return (
      <img
        src={props.file.url}
        alt=''
        className='size-5 shrink-0 rounded-sm object-cover'
      />
    )
  }
  const Icon = KIND_ICONS[kind]
  return (
    <Icon
      aria-hidden='true'
      className='text-muted-foreground size-4 shrink-0'
    />
  )
}

function createChip(file: MentionFile, fallback: string): HTMLSpanElement {
  const chip = document.createElement('span')
  chip.contentEditable = 'false'
  chip.dataset.mentionId = file.id
  chip.dataset.mentionLabel = mentionLabel(file, fallback)
  chip.className = CHIP_CLASS
  const name = file.filename || fallback
  chip.title = name
  chip.setAttribute('role', 'img')
  chip.setAttribute('aria-label', name)
  if (file.url && referenceKind(file) === 'image') {
    const image = document.createElement('img')
    image.src = file.url
    image.alt = ''
    image.className = 'size-3.5 shrink-0 rounded-sm object-cover'
    chip.append(image)
  }
  const label = document.createElement('span')
  label.className = 'min-w-0 truncate'
  label.textContent = name
  chip.append(label)
  return chip
}

function placeCaret(node: Text, offset: number) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

/**
 * Replaces the @ query at the caret with an atomic file chip. Uses the last
 * text node when the browser has no selection, which is how tests type.
 */
function insertChip(root: HTMLElement, file: MentionFile, fallback: string) {
  const selection = window.getSelection()
  let node: Text | null = null
  let end = 0
  if (
    selection &&
    selection.rangeCount > 0 &&
    selection.anchorNode?.nodeType === Node.TEXT_NODE &&
    root.contains(selection.anchorNode)
  ) {
    node = selection.anchorNode as Text
    end = selection.anchorOffset
  } else {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let last: Text | null = null
    while (walker.nextNode()) last = walker.currentNode as Text
    node = last
    end = node?.textContent?.length ?? 0
  }
  if (!node) return
  const before = (node.textContent ?? '').slice(0, end)
  const at = mentionMark(before)
  if (at < 0) return
  const after = (node.textContent ?? '').slice(end)
  node.textContent = before.slice(0, at)
  const chip = createChip(file, fallback)
  const tail = document.createTextNode(` ${after}`)
  node.after(chip)
  chip.after(tail)
  placeCaret(tail, 1)
}

/** A mention is a whole token: it starts and ends at a space or another @. */
const MENTION_EDGE = /[\s@]/

/**
 * Puts a chip back around a mention still present as text. A reload restores
 * the prompt text and the files separately, so "@cat.png" would otherwise
 * stay plain text next to a restored file. Returns whether a chip was made.
 */
function restoreMentionChip(
  root: HTMLElement,
  file: MentionFile,
  fallback: string
): boolean {
  // Without a name there is no mention token to look for.
  if (!file.filename) return false
  const label = mentionLabel(file, fallback)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const text = node.textContent ?? ''
    let from = 0
    for (;;) {
      const at = text.indexOf(label, from)
      if (at < 0) break
      const before = text[at - 1]
      const after = text[at + label.length]
      const whole =
        (before === undefined || MENTION_EDGE.test(before)) &&
        (after === undefined || MENTION_EDGE.test(after))
      if (whole) {
        const chip = createChip(file, fallback)
        node.textContent = text.slice(0, at)
        node.after(chip)
        chip.after(document.createTextNode(text.slice(at + label.length)))
        return true
      }
      from = at + 1
    }
  }
  return false
}

const QUIET_BUTTON =
  'hover:bg-transparent hover:text-inherit dark:hover:bg-transparent'

type ReferenceFileChipProps = {
  file: MentionFile
  uploading?: boolean
  onOpen: () => void
  onRemove: () => void
}

/** One uploaded file. The title is the full name; a click opens the preview. */
function ReferenceFileChip(props: ReferenceFileChipProps) {
  const { t } = useTranslation()
  const name = props.file.filename || t('Image')
  return (
    <div
      className='border-border flex h-8 max-w-48 min-w-0 items-center gap-1 overflow-hidden rounded-md border pr-1 pl-1.5 text-sm'
      title={name}
    >
      <Button
        type='button'
        variant='ghost'
        className={cn(
          'h-auto min-w-0 flex-1 justify-start gap-1.5 px-0',
          QUIET_BUTTON
        )}
        onClick={props.onOpen}
      >
        <ReferenceThumbnail file={props.file} />
        <span className='block max-w-32 truncate'>{name}</span>
      </Button>
      {props.uploading ? (
        <Loader2
          aria-label={t('Uploading...')}
          className='text-muted-foreground size-3 shrink-0 animate-spin'
        />
      ) : null}
      <Button
        type='button'
        variant='ghost'
        size='icon-xs'
        className={cn('size-5', QUIET_BUTTON)}
        aria-label={t('Remove attachment')}
        onClick={props.onRemove}
      >
        <X />
      </Button>
    </div>
  )
}

/** Uploaded files sit at the top of the prompt. A click opens the shared preview. */
function ReferenceFiles(props: { uploading?: boolean }) {
  const { t } = useTranslation()
  const attachments = usePromptInputAttachments()
  const [preview, setPreview] = useState<{
    file: MentionFile
    kind: MediaKind
  } | null>(null)
  if (attachments.files.length === 0 && !preview) return null

  // A plain file has nothing to show, so only previewable references open.
  const openPreview = (file: MentionFile) => {
    const kind = referenceKind(file)
    if (!file.url || kind === 'file') return
    setPreview({ file, kind })
  }

  return (
    <>
      {attachments.files.length > 0 && (
        <div className='flex w-full min-w-0 flex-wrap gap-1.5 px-3 pt-2'>
          {attachments.files.map((file) => (
            <ReferenceFileChip
              key={file.id}
              file={file}
              uploading={props.uploading}
              onOpen={() => openPreview(file)}
              onRemove={() => attachments.remove(file.id)}
            />
          ))}
        </div>
      )}
      {preview && (
        <MediaLightbox
          open
          onOpenChange={(open) => {
            if (!open) setPreview(null)
          }}
          src={preview.file.url ?? ''}
          alt={preview.file.filename || t('Preview')}
          kind={preview.kind}
          title={t('Preview')}
          onDownload={() => {
            if (preview.file.url) {
              void downloadMedia(
                preview.file.url,
                preview.file.filename || 'reference'
              )
            }
          }}
        />
      )}
    </>
  )
}

type MentionMenuProps = {
  id: string
  files: MentionFile[]
  matches: MentionFile[]
  index: number
  top: number
  left: number
  onHover: (index: number) => void
  onChoose: (file: MentionFile) => void
}

function MentionMenu(props: MentionMenuProps) {
  const { t } = useTranslation()
  return (
    <ul
      id={props.id}
      role='listbox'
      aria-label={t('Uploaded files')}
      style={{ top: props.top, left: props.left }}
      className='border-border bg-popover text-popover-foreground absolute z-20 max-h-48 w-56 overflow-y-auto rounded-lg border p-1 shadow-md'
    >
      {props.matches.length === 0 ? (
        <li className='text-muted-foreground px-2 py-1.5 text-xs'>
          {props.files.length === 0
            ? t('Upload a file to mention it')
            : t('No matching files')}
        </li>
      ) : (
        props.matches.map((file, optionIndex) => {
          return (
            <li key={file.id}>
              <button
                type='button'
                role='option'
                aria-selected={optionIndex === props.index}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                  optionIndex === props.index &&
                    'bg-accent text-accent-foreground'
                )}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => props.onHover(optionIndex)}
                onClick={() => props.onChoose(file)}
              >
                <ReferenceThumbnail file={file} />
                <span className='truncate'>{file.filename || t('Image')}</span>
              </button>
            </li>
          )
        })
      )}
    </ul>
  )
}

/**
 * Prompt field that can mention an uploaded file. Typing @ opens that list;
 * the chosen file becomes a chip, the way a Cursor file mention does.
 */
export function PromptMentionInput(props: PromptMentionInputProps) {
  const { t } = useTranslation()
  const attachments = usePromptInputAttachments()
  const rootRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const hiddenRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const [query, setQuery] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 8 })
  const [serialized, setSerialized] = useState('')
  const composing = useRef(false)
  // Set while the text came from storage rather than from typing: only then is
  // a mention turned back into a chip, so typing "@cat.png" stays plain text.
  const fromStorage = useRef(false)

  const files: MentionFile[] = attachments.files
  const matches = query === null ? [] : filterMentionFiles(files, query)
  const open = query !== null

  const onChangeRef = useRef(props.onChange)
  useEffect(() => {
    onChangeRef.current = props.onChange
  }, [props.onChange])
  const publish = useCallback((next: string) => {
    setSerialized(next)
    // Submit reads the field in this same turn, before the controlled value renders.
    if (hiddenRef.current) hiddenRef.current.value = next
    onChangeRef.current(next)
  }, [])

  const refresh = () => {
    const editor = editorRef.current
    if (!editor || composing.current) return
    const before = textBeforeCaret(editor)
    const nextQuery = activeMentionQuery(before)
    setQuery(nextQuery)
    if (nextQuery !== query) setIndex(0)
    const host = rootRef.current
    if (nextQuery !== null && host) {
      const hostRect = host.getBoundingClientRect()
      const selection = window.getSelection()
      const caret =
        selection && selection.rangeCount > 0
          ? selection.getRangeAt(0).getClientRects()[0]
          : undefined
      const anchor = caret ?? editor.getBoundingClientRect()
      setMenuPos({
        top: anchor.bottom - hostRect.top + 4,
        left: caret ? Math.max(8, caret.left - hostRect.left) : 8,
      })
    }
    publish(editorPrompt(editor))
  }

  const choose = (file: MentionFile) => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    insertChip(editor, file, t('Image'))
    setQuery(null)
    publish(editorPrompt(editor))
  }

  // The parent owns the text: a restored draft arrives on mount, and the page
  // may clear the box after a send. The editor DOM is written only when it
  // disagrees with the value, so typing — where the two already match — never
  // moves the caret.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || editorPrompt(editor) === props.value) return
    editor.textContent = props.value
    // A restored draft carries its mentions as text; the chips come back with
    // the files (see the reconciliation effect below).
    fromStorage.current = true
    setQuery(null)
    publish(props.value)
  }, [props.value, publish])

  // Chips live in the editor DOM, so they are reconciled with the file list by
  // hand: a chip whose file is gone is dropped, and a mention whose restored
  // file is back gets its chip again.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const ids = new Set(attachments.files.map((file) => file.id))
    const chipped = new Set<string>()
    let removed = false
    for (const chip of editor.querySelectorAll<HTMLElement>(
      '[data-mention-id]'
    )) {
      const id = chip.dataset.mentionId ?? ''
      if (!ids.has(id)) {
        chip.remove()
        removed = true
        continue
      }
      chipped.add(id)
    }
    // Only a restored draft can hold a mention that lost its chip; typed text
    // never turns into one on its own.
    if (fromStorage.current) {
      for (const file of attachments.files) {
        if (chipped.has(file.id)) continue
        // The same file can be mentioned more than once.
        while (restoreMentionChip(editor, file, t('Image'))) {
          chipped.add(file.id)
        }
      }
    }
    // A restored chip keeps the text unchanged, so only a removal changes it.
    if (removed) publish(editorPrompt(editor))
  }, [attachments.files, publish, t])

  useEffect(() => {
    const form = rootRef.current?.closest('form')
    if (!form) return
    const blurEditor = () => editorRef.current?.blur()
    form.addEventListener('submit', blurEditor)
    return () => form.removeEventListener('submit', blurEditor)
  }, [])

  return (
    <div ref={rootRef} className='relative w-full min-w-0'>
      <input
        ref={hiddenRef}
        type='hidden'
        name='message'
        value={serialized}
        readOnly
      />
      <ReferenceFiles uploading={props.uploading} />
      <div className='relative w-full min-w-0'>
        {props.value === '' && (
          <span className='text-muted-foreground pointer-events-none absolute top-2 right-3 left-3 line-clamp-2 text-sm leading-5'>
            {props.placeholder}
          </span>
        )}
        <div
          ref={editorRef}
          role='textbox'
          aria-multiline='true'
          aria-label={props.label}
          aria-disabled={props.disabled || undefined}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete='list'
          contentEditable={props.disabled ? 'false' : 'plaintext-only'}
          data-slot='input-group-control'
          suppressContentEditableWarning
          className='max-h-48 min-h-16 w-full overflow-y-auto px-3 py-2 text-sm break-all whitespace-pre-wrap outline-none'
          onInput={() => {
            // Typing owns the text from here on.
            fromStorage.current = false
            refresh()
          }}
          onKeyUp={refresh}
          onClick={refresh}
          onCompositionStart={() => {
            composing.current = true
          }}
          onCompositionEnd={() => {
            composing.current = false
            refresh()
          }}
          onBlur={() => {
            requestAnimationFrame(() => setQuery(null))
          }}
          onPaste={(event) => {
            const pasted: File[] = []
            for (const item of event.clipboardData.items) {
              if (item.kind !== 'file') continue
              const file = item.getAsFile()
              if (file) pasted.push(file)
            }
            if (pasted.length > 0) {
              event.preventDefault()
              attachments.add(pasted)
              return
            }
            event.preventDefault()
            const text = event.clipboardData.getData('text/plain')
            const selection = window.getSelection()
            if (!selection || selection.rangeCount === 0 || !text) return
            const range = selection.getRangeAt(0)
            range.deleteContents()
            const node = document.createTextNode(text)
            range.insertNode(node)
            placeCaret(node, text.length)
            refresh()
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || composing.current) return
            if (open) {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setIndex((current) =>
                  matches.length === 0 ? 0 : (current + 1) % matches.length
                )
                return
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setIndex((current) =>
                  matches.length === 0
                    ? 0
                    : (current - 1 + matches.length) % matches.length
                )
                return
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setQuery(null)
                return
              }
              if (
                (event.key === 'Enter' || event.key === 'Tab') &&
                !event.shiftKey &&
                matches[index]
              ) {
                event.preventDefault()
                choose(matches[index])
                return
              }
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              event.currentTarget.closest('form')?.requestSubmit()
            }
          }}
        />
      </div>
      {open && (
        <MentionMenu
          id={listId}
          files={files}
          matches={matches}
          index={index}
          top={menuPos.top}
          left={menuPos.left}
          onHover={setIndex}
          onChoose={choose}
        />
      )}
    </div>
  )
}
