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
import type { TFunction } from 'i18next'
import { Plus } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { resolveLocalizedText } from '@/lib/localized-text'
import { cn } from '@/lib/utils'

import type { ModelCapability, ParamField } from '../lib/capabilities'
import {
  acceptedReferenceKinds,
  numberMentionTokens,
  referenceKind,
  type ReferenceKind,
} from '../lib/file-mention'
import {
  loadReferenceFiles,
  saveReferenceFiles,
} from '../lib/reference-storage'
import type { GenerationValues, ReferenceAttachment } from '../types'
import { PromptMentionInput } from './prompt-mention-input'

type MenuItem = {
  value: string
  label: string
  hint?: string
  /** Native tooltip. Model rows use the catalog description. */
  title?: string
}

type GenerateComposerProps = {
  modelItems: MenuItem[]
  model: string
  /** Shown in the empty prompt. The page supplies the model description. */
  promptPlaceholder: string
  onModelChange: (value: string) => void
  /** The controls this model accepts; a different model shows a different set. */
  capability: ModelCapability
  values: GenerationValues
  onValueChange: (key: string, value: string) => void
  /** The draft text, owned by the page so it survives a reload with it. */
  prompt: string
  onPromptChange: (value: string) => void
  /** Returns false when the prompt was held back (e.g. waiting on a confirm). */
  onSubmit: (prompt: string, references: ReferenceAttachment[]) => boolean
  busy: boolean
  /** Reference media is still travelling to storage; no success toast. */
  uploading?: boolean
  disabled: boolean
}

function ParamLabel(props: { children: string }) {
  return (
    <span className='text-muted-foreground shrink-0'>{props.children}:</span>
  )
}

type ParamSelectProps = {
  label: string
  items: MenuItem[]
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}

/** A labelled parameter dropdown; every selector in the footer is one of these. */
function ParamSelect(props: ParamSelectProps) {
  return (
    <Select
      items={props.items}
      value={props.value}
      onValueChange={(value) => props.onValueChange(String(value))}
      disabled={props.disabled}
    >
      <SelectTrigger
        className={props.className}
        aria-label={props.label}
        size='sm'
      >
        <ParamLabel>{props.label}</ParamLabel>
        <SelectValue placeholder={props.placeholder} />
      </SelectTrigger>
      <SelectContent
        alignItemWithTrigger={false}
        className='max-h-60 w-auto max-w-[min(20rem,calc(100vw-1.5rem))] min-w-(--anchor-width) overflow-x-auto overflow-y-auto'
      >
        {props.items.map((item) => (
          <SelectItem
            key={item.value}
            value={item.value}
            title={item.title}
            className='w-max min-w-full'
          >
            <span>{item.label}</span>
            {item.hint ? (
              <span className='text-muted-foreground ml-auto pl-3 text-xs tabular-nums'>
                {item.hint}
              </span>
            ) : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

type ParamNumberProps = {
  label: string
  value: string
  min: number
  max: number
  suffix?: string
  onValueChange: (value: string) => void
  disabled?: boolean
}

/** A labelled numeric field for values with no fixed option list. */
function ParamNumber(props: ParamNumberProps) {
  return (
    <label className='border-input flex h-8 items-center gap-1 rounded-lg border px-2 text-sm'>
      <ParamLabel>{props.label}</ParamLabel>
      <Input
        type='number'
        inputMode='numeric'
        min={props.min}
        max={props.max}
        step={1}
        value={props.value}
        onChange={(event) => props.onValueChange(event.target.value)}
        onBlur={() => {
          const parsed = Number(props.value)
          const next = Number.isFinite(parsed)
            ? Math.min(props.max, Math.max(props.min, Math.round(parsed)))
            : props.min
          if (String(next) !== props.value) props.onValueChange(String(next))
        }}
        disabled={props.disabled}
        aria-label={props.label}
        className='h-6 w-12 border-0 bg-transparent px-0 text-right text-sm shadow-none focus-visible:ring-0 dark:bg-transparent'
      />
      {props.suffix && (
        <span className='text-muted-foreground text-xs'>{props.suffix}</span>
      )}
    </label>
  )
}

const REFERENCE_IMAGE_TYPES = 'image/*'
const REFERENCE_VIDEO_AUDIO_TYPES = 'video/*,audio/*'
const MAX_REFERENCE_MEDIA_BYTES = 100 * 1024 * 1024
/** Longest prompt the composer sends; the counter shows how much is used. */
const PROMPT_MAX_CHARS = 6000

/**
 * How a prompt refers to a reference: the kind and its number within that
 * kind, because the vendor receives the media as an ordered list and never
 * sees the local file names.
 */
const MENTION_LABEL_KEYS: Record<ReferenceKind, string> = {
  image: 'Image {{index}}',
  audio: 'Audio {{index}}',
  video: 'Video {{index}}',
  file: 'File {{index}}',
}

/** The prompt as sent: mentions become their kind and number ("图片1"). */
function composePrompt(
  text: string,
  files: ReferenceAttachment[],
  t: TFunction
): string {
  return numberMentionTokens(
    text.trim(),
    files.filter((file) => Boolean(file.url)),
    t('Image'),
    (kind, index) => t(MENTION_LABEL_KEYS[kind], { index })
  )
}

/** Code points, so an emoji is one character rather than two. */
function promptCharCount(text: string): number {
  return [...text].length
}

/**
 * The character counter and the send button. They live inside PromptInput
 * because the sent prompt — with mentions replaced by kind and number — needs
 * the attachment list.
 */
function PromptFooterActions(props: {
  prompt: string
  ready: boolean
  busy: boolean
  uploading?: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const attachments = usePromptInputAttachments()
  const chars = promptCharCount(
    composePrompt(props.prompt, attachments.files, t)
  )
  const tooLong = chars > PROMPT_MAX_CHARS
  return (
    <div className='ml-auto flex shrink-0 items-center gap-2'>
      <span
        className={cn(
          'text-muted-foreground text-xs tabular-nums',
          tooLong && 'text-destructive font-medium'
        )}
      >
        {`${formatNumber(chars, locale)} / ${formatNumber(PROMPT_MAX_CHARS, locale)}`}
      </span>
      <PromptInputSubmit
        status={props.busy || props.uploading ? 'submitted' : undefined}
        disabled={!props.ready || Boolean(props.uploading) || tooLong}
        aria-label={t('Generate')}
      />
    </div>
  )
}

/** Opens the image picker. Dragging onto the prompt does the same. */
function AddReferenceImage(props: { disabled?: boolean }) {
  const { t } = useTranslation()
  const attachments = usePromptInputAttachments()
  return (
    <PromptInputButton
      aria-label={t('Add reference media')}
      disabled={props.disabled}
      onClick={() => attachments.openFileDialog()}
    >
      <Plus aria-hidden='true' />
    </PromptInputButton>
  )
}

/**
 * A model switch keeps the prompt's attachments, but the new model may not
 * accept them: an audio reference for a video model must not reach an image
 * request. Drop every file the new capability no longer routes.
 */
function DropUnacceptedReferences(props: { accept: string }) {
  const attachments = usePromptInputAttachments()
  const accepted = acceptedReferenceKinds(props.accept)
  useEffect(() => {
    // The list only shrinks, so one pass per attachment change settles it.
    for (const file of attachments.files) {
      if (!accepted.has(referenceKind(file))) attachments.remove(file.id)
    }
  }, [accepted, attachments])
  return null
}

/**
 * Puts back the references of the previous visit and keeps the stored copy in
 * step with the composer. Rendered inside PromptInput for its attachment list.
 * `ready` is false until a real model is selected: the fallback capability
 * accepts no media, so restoring before then would erase the stored set.
 */
function PersistReferences(props: { ready: boolean }) {
  const attachments = usePromptInputAttachments()
  // The attachment context is rebuilt on every render, so the values are read
  // through refs: restoring runs once, not once per render.
  const addRef = useRef(attachments.add)
  const filesRef = useRef(attachments.files)
  useEffect(() => {
    addRef.current = attachments.add
    filesRef.current = attachments.files
  })
  const started = useRef(false)
  const restored = useRef(false)
  const alive = useRef(true)
  // Restoring re-adds the files that were just read; that echo needs no save.
  const skipSave = useRef(false)
  const savedSignature = useRef<string | null>(null)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (!props.ready || started.current) return
    started.current = true
    loadReferenceFiles()
      .then((files) => {
        if (!alive.current) return
        if (files.length > 0) {
          skipSave.current = true
          addRef.current(files)
        }
        restored.current = true
      })
      .catch(() => {
        if (alive.current) restored.current = true
      })
  }, [props.ready])

  // The list is a fresh array on every render, so the effect watches which
  // files are attached rather than the array itself.
  const signature = attachments.files.map((file) => file.id).join('|')
  useEffect(() => {
    if (!restored.current) return
    if (skipSave.current) {
      skipSave.current = false
      savedSignature.current = signature
      return
    }
    if (signature === savedSignature.current) return
    savedSignature.current = signature
    // A failed save (quota, private mode) only costs the stored copy.
    void saveReferenceFiles(filesRef.current).catch(() => undefined)
  }, [signature])

  return null
}

/** One capability field, labelled and drawn as a footer control. */
function ParamFieldControl(props: {
  field: ParamField
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
}) {
  const { t, i18n } = useTranslation()
  // A "Duration" field in a generation profile is the clip length, while the
  // usage logs reuse that key for elapsed time (耗时), so the composer asks for
  // the clip-length translation rather than showing the wrong one.
  const label = props.field.label
    ? resolveLocalizedText(props.field.label, i18n.language)
    : t(
        props.field.labelKey === 'Duration'
          ? 'Video duration'
          : props.field.labelKey
      )
  if (props.field.type === 'select') {
    return (
      <ParamSelect
        label={label}
        items={props.field.options ?? []}
        value={props.value}
        onValueChange={props.onValueChange}
        disabled={props.disabled}
      />
    )
  }
  return (
    <ParamNumber
      label={label}
      value={props.value}
      min={props.field.min ?? 0}
      max={props.field.max ?? Number.MAX_SAFE_INTEGER}
      suffix={props.field.key === 'seconds' ? 's' : undefined}
      onValueChange={props.onValueChange}
      disabled={props.disabled}
    />
  )
}

/**
 * Prompt bar for the generation feed: the prompt on top, the model and its
 * parameters underneath, send on the right.
 */
export function GenerateComposer(props: GenerateComposerProps) {
  const { t } = useTranslation()

  const fields = props.capability.fields
  const ready =
    !props.disabled && props.model !== '' && props.prompt.trim() !== ''

  const referenceImages = props.capability.referenceImages
  const acceptsReferences =
    Boolean(referenceImages) || props.capability.mediaNotice
  const maxReferences =
    referenceImages?.max ?? (props.capability.mediaNotice ? 5 : 0)
  // A model accepts only the media kinds its capability routes: images when it
  // declares referenceImages, audio and video when it sets mediaNotice.
  const acceptedTypes = [
    referenceImages ? REFERENCE_IMAGE_TYPES : '',
    props.capability.mediaNotice ? REFERENCE_VIDEO_AUDIO_TYPES : '',
  ]
    .filter(Boolean)
    .join(',')
  // The prompt input rebuilds its attachment context when a callback changes
  // identity, so a stable handler keeps the composer from resaving per render.
  const handleFileError = useCallback(
    (error: { message: string }) => {
      if (acceptsReferences) toast.error(error.message)
    },
    [acceptsReferences]
  )
  const handleSubmit = (message: PromptInputMessage) => {
    const files = (message.files ?? []).filter((file) => Boolean(file.url))
    const prompt = composePrompt(message.text ?? '', files, t)
    if (!prompt || !ready || promptCharCount(prompt) > PROMPT_MAX_CHARS) return
    const references = files.map((file) => ({
      url: file.url,
      mediaType: file.mediaType ?? 'application/octet-stream',
      filename: file.filename,
    }))
    props.onSubmit(prompt, references)
    // Keep the prompt and the files. PromptInput clears attachments when
    // submit resolves, so this rejection leaves them in place.
    return Promise.reject(new Error('keep'))
  }

  return (
    <PromptInput
      className='relative'
      groupClassName={cn(
        'bg-background/95 dark:bg-background/80 border-border/70 rounded-xl shadow-[0_18px_60px_-32px_rgba(0,0,0,0.65)]',
        props.busy && 'bg-muted/50 focus-within:bg-background/95'
      )}
      accept={acceptsReferences ? acceptedTypes : undefined}
      multiple={maxReferences > 1}
      maxFiles={maxReferences}
      maxFileSize={MAX_REFERENCE_MEDIA_BYTES}
      onError={handleFileError}
      onSubmit={handleSubmit}
    >
      <DropUnacceptedReferences accept={acceptedTypes} />
      <PersistReferences ready={props.model !== ''} />
      <PromptMentionInput
        value={props.prompt}
        onChange={props.onPromptChange}
        placeholder={props.promptPlaceholder}
        label={t('Prompt')}
        uploading={props.uploading}
        disabled={props.disabled}
      />
      {/* Every parameter shares one row and wraps only when the width runs
          out; the send button stays pinned to the bottom-right corner. */}
      <PromptInputFooter className='border-border/60 bg-muted/20 dark:bg-muted/10 items-end gap-2 border-t px-3 py-2'>
        <PromptInputTools className='min-w-0 flex-1 flex-wrap items-center gap-1'>
          {acceptsReferences && <AddReferenceImage disabled={props.disabled} />}
          <ParamSelect
            label={t('Model')}
            items={props.modelItems}
            value={props.model}
            onValueChange={props.onModelChange}
            disabled={props.disabled}
            placeholder={t('Select a model')}
            className='max-w-52 min-w-0'
          />
          {fields.map((field) => (
            <ParamFieldControl
              key={field.key}
              field={field}
              value={props.values[field.key] ?? String(field.defaultValue)}
              onValueChange={(next) => props.onValueChange(field.key, next)}
              disabled={props.disabled}
            />
          ))}
        </PromptInputTools>

        <PromptFooterActions
          prompt={props.prompt}
          ready={ready}
          busy={props.busy}
          uploading={props.uploading}
        />
      </PromptInputFooter>
    </PromptInput>
  )
}
