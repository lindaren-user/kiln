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
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
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
import type { ApiKey } from '@/features/keys/types'
import { cn } from '@/lib/utils'

import type { ModelCapability, ParamField } from '../lib/capabilities'
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
  keys: ApiKey[]
  selectedKeyId: number | null
  onKeyChange: (id: number) => void
  /** Returns false when the prompt was held back (e.g. waiting on a confirm). */
  onSubmit: (prompt: string, references: ReferenceAttachment[]) => boolean
  busy: boolean
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
const MAX_REFERENCE_MEDIA_BYTES = 100 * 1024 * 1024

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

/** One capability field, labelled and drawn as a footer control. */
function ParamFieldControl(props: {
  field: ParamField
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  if (props.field.type === 'select') {
    return (
      <ParamSelect
        label={t(props.field.labelKey)}
        items={props.field.options}
        value={props.value}
        onValueChange={props.onValueChange}
        disabled={props.disabled}
      />
    )
  }
  const label =
    props.field.key === 'seconds'
      ? t('Duration {{min}}-{{max}}s', {
          min: props.field.min,
          max: props.field.max,
        })
      : t(props.field.labelKey)
  return (
    <ParamNumber
      label={label}
      value={props.value}
      min={props.field.min}
      max={props.field.max}
      suffix={props.field.suffix}
      onValueChange={props.onValueChange}
      disabled={props.disabled}
    />
  )
}

/**
 * Prompt bar for the generation feed: the prompt on top, the model, its
 * parameters and the API key underneath, send on the right.
 */
export function GenerateComposer(props: GenerateComposerProps) {
  const { t } = useTranslation()
  const [text, setText] = useState('')

  // Option arrays depend on the model capability or the key list, not on typing.
  // TODO: Hide resolution until a model declares the sizes its upstream
  // actually accepts. Most of these interfaces have no resolution choice,
  // and a shared list sends sizes they reject. The default is still sent.
  const fields = useMemo<ParamField[]>(() => {
    const visible = props.capability.fields.filter(
      (field) => field.key !== 'resolution'
    )
    return visible.map((field) => {
      if (field.type !== 'select') return field
      return {
        ...field,
        options: field.options.map((option) => {
          if (option.value === 'auto') return { ...option, label: t('Auto') }
          if (option.value === 'adaptive') {
            return { ...option, label: t('Adaptive') }
          }
          return option
        }),
      }
    })
  }, [props.capability, t])
  const keyItems = useMemo(
    () => props.keys.map((key) => ({ value: String(key.id), label: key.name })),
    [props.keys]
  )
  const ready =
    !props.disabled &&
    props.model !== '' &&
    props.selectedKeyId !== null &&
    text.trim() !== ''

  const referenceImages = props.capability.referenceImages
  const acceptsReferences =
    Boolean(referenceImages) || props.capability.mediaNotice
  const maxReferences =
    props.capability.kind === 'video' && acceptsReferences
      ? 5
      : (referenceImages?.max ?? 0)
  const handleSubmit = (message: PromptInputMessage) => {
    const prompt = message.text?.trim() ?? ''
    if (!prompt || !ready) return
    const references = (message.files ?? [])
      .filter((file) => Boolean(file.url))
      .map((file) => ({
        url: file.url,
        mediaType: file.mediaType ?? 'application/octet-stream',
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
      accept={
        referenceImages && !props.capability.mediaNotice
          ? REFERENCE_IMAGE_TYPES
          : undefined
      }
      multiple={maxReferences > 1}
      maxFiles={maxReferences}
      maxFileSize={MAX_REFERENCE_MEDIA_BYTES}
      onError={(error) => {
        if (acceptsReferences) toast.error(error.message)
      }}
      onSubmit={handleSubmit}
    >
      <PromptMentionInput
        value={text}
        onChange={setText}
        placeholder={props.promptPlaceholder}
        label={t('Prompt')}
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
          <ParamSelect
            label={t('API key')}
            items={keyItems}
            value={
              props.selectedKeyId === null ? '' : String(props.selectedKeyId)
            }
            onValueChange={(value) => props.onKeyChange(Number(value))}
            disabled={props.disabled || props.keys.length === 0}
            placeholder={t('Select an API key')}
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

        <PromptInputSubmit
          className='ml-auto shrink-0 self-end'
          status={props.busy ? 'submitted' : undefined}
          disabled={!ready}
          aria-label={t('Generate')}
        />
      </PromptInputFooter>
    </PromptInput>
  )
}
