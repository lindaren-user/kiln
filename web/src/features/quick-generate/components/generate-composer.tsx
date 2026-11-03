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
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ApiKey } from '@/features/keys/types'

import type { ModelCapability, ParamField } from '../lib/capabilities'
import type { GenerationValues } from '../types'
import { PromptMentionInput } from './prompt-mention-input'

type GenerateComposerProps = {
  modelItems: { value: string; label: string }[]
  model: string
  onModelChange: (value: string) => void
  /** The controls this model accepts; a different model shows a different set. */
  capability: ModelCapability
  values: GenerationValues
  onValueChange: (key: string, value: string) => void
  keys: ApiKey[]
  selectedKeyId: number | null
  onKeyChange: (id: number) => void
  /** Returns false when the prompt was held back (e.g. waiting on a confirm). */
  onSubmit: (prompt: string, images: string[]) => boolean
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
  items: { value: string; label: string }[]
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
      <SelectContent alignItemWithTrigger={false}>
        {props.items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
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
        value={props.value}
        onChange={(event) => props.onValueChange(event.target.value)}
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
/** Keeps a data URL small enough for the JSON generation body. */
const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024

/** Opens the image picker. Dragging onto the prompt does the same. */
function AddReferenceImage(props: { disabled?: boolean }) {
  const { t } = useTranslation()
  const attachments = usePromptInputAttachments()
  return (
    <PromptInputButton
      aria-label={t('Add a reference image')}
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
  return (
    <ParamNumber
      label={t(props.field.labelKey)}
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
  const fields = useMemo<ParamField[]>(
    () =>
      props.capability.fields.map((field) => {
        if (field.type !== 'select') return field
        return {
          ...field,
          options: field.options.map((option) =>
            option.value === 'auto' ? { ...option, label: t('Auto') } : option
          ),
        }
      }),
    [props.capability, t]
  )
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
  const handleSubmit = (message: PromptInputMessage) => {
    const prompt = message.text?.trim() ?? ''
    if (!prompt || !ready) return
    const images = (message.files ?? [])
      .map((file) => file.url)
      .filter((url): url is string => Boolean(url))
    props.onSubmit(prompt, images)
    // Keep the prompt and the files. PromptInput clears attachments when
    // submit resolves, so this rejection leaves them in place.
    return Promise.reject(new Error('keep'))
  }

  return (
    <PromptInput
      key={props.model}
      className='relative'
      groupClassName={cn(
        'bg-background/95 dark:bg-background/80 border-border/70 rounded-xl shadow-[0_18px_60px_-32px_rgba(0,0,0,0.65)]',
        props.busy && 'bg-muted/50 focus-within:bg-background/95'
      )}
      accept={referenceImages ? REFERENCE_IMAGE_TYPES : undefined}
      multiple={(referenceImages?.max ?? 0) > 1}
      maxFiles={referenceImages?.max ?? 0}
      maxFileSize={MAX_REFERENCE_IMAGE_BYTES}
      onError={(error) => {
        if (referenceImages) toast.error(error.message)
      }}
      onSubmit={handleSubmit}
    >
      <PromptMentionInput
        value={text}
        onChange={setText}
        placeholder={t('Describe what you want to create')}
        label={t('Prompt')}
        disabled={props.disabled}
      />
      {props.capability.mediaNotice && (
        <p className='text-warning px-3 pt-1 text-xs'>
          {t('This version does not support reference video or audio.')}
        </p>
      )}

      {/* Every parameter shares one row and wraps only when the width runs
          out; the send button stays pinned to the bottom-right corner. */}
      <PromptInputFooter className='border-border/60 bg-muted/20 dark:bg-muted/10 items-end gap-2 border-t px-3 py-2'>
        <PromptInputTools className='min-w-0 flex-1 flex-wrap items-center gap-1'>
          {referenceImages && <AddReferenceImage disabled={props.disabled} />}
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
