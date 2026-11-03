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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  IMAGE_COUNT_ITEMS,
  IMAGE_RATIO_ITEMS,
  IMAGE_RESOLUTION_ITEMS,
  type ImageResolution,
} from '@/features/image-generation/constants'
import type { ImageOption } from '@/features/image-generation/types'
import type { ApiKey } from '@/features/keys/types'

type GenerateComposerProps = {
  modelItems: ImageOption[]
  model: string
  onModelChange: (value: string) => void
  ratio: string
  onRatioChange: (value: string) => void
  resolution: ImageResolution
  onResolutionChange: (value: ImageResolution) => void
  count: number
  onCountChange: (count: number) => void
  keys: ApiKey[]
  selectedKeyId: number | null
  onKeyChange: (id: number) => void
  /** Returns false when the prompt was held back (e.g. waiting on a confirm). */
  onSubmit: (prompt: string) => boolean
  busy: boolean
  disabled: boolean
}

/** Muted `Label:` prefix so each parameter reads as a labelled field. */
function ParamLabel(props: { children: string }) {
  return (
    <span className='text-muted-foreground shrink-0'>{props.children}:</span>
  )
}

type ParamSelectProps = {
  label: string
  items: ImageOption[]
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

/**
 * Prompt bar for the generation feed: the prompt on top, the model, size,
 * count and API key parameters underneath, send on the right.
 */
export function GenerateComposer(props: GenerateComposerProps) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  // Option arrays depend on the translation or the key list, not on typing.
  const ratioItems = useMemo(
    () =>
      IMAGE_RATIO_ITEMS.map((item) => ({
        value: item.value,
        label: item.value === 'auto' ? t('Auto') : item.label,
      })),
    [t]
  )
  const keyItems = useMemo(
    () => props.keys.map((key) => ({ value: String(key.id), label: key.name })),
    [props.keys]
  )
  const ready =
    !props.disabled &&
    !props.busy &&
    props.model !== '' &&
    props.selectedKeyId !== null &&
    text.trim() !== ''

  const handleSubmit = (message: PromptInputMessage) => {
    const prompt = message.text?.trim() ?? ''
    if (!prompt || !ready) return
    if (props.onSubmit(prompt)) setText('')
  }

  return (
    <PromptInput
      className='relative'
      groupClassName='bg-background/95 dark:bg-background/80 border-border/70 rounded-xl shadow-[0_18px_60px_-32px_rgba(0,0,0,0.65)]'
      onSubmit={handleSubmit}
    >
      <PromptInputTextarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t('Describe what you want to create')}
        aria-label={t('Prompt')}
        disabled={props.disabled}
        className='min-h-16'
      />

      {/* Never wrap the footer itself: the tools take the wrapped rows, the
          send button stays pinned to the inline end. */}
      <PromptInputFooter className='border-border/60 bg-muted/20 dark:bg-muted/10 items-end gap-2 border-t px-3 py-2'>
        <PromptInputTools className='min-w-0 flex-1 flex-col items-start gap-1.5'>
          <div className='flex min-w-0 flex-wrap items-center gap-1'>
            <ParamSelect
              label={t('Aspect Ratio')}
              items={ratioItems}
              value={props.ratio}
              onValueChange={props.onRatioChange}
              disabled={props.disabled}
            />
            <ParamSelect
              label={t('Resolution')}
              items={IMAGE_RESOLUTION_ITEMS}
              value={props.resolution}
              onValueChange={(value) =>
                props.onResolutionChange(value as ImageResolution)
              }
              disabled={props.disabled || props.ratio === 'auto'}
            />
            <ParamSelect
              label={t('Count')}
              items={IMAGE_COUNT_ITEMS}
              value={String(props.count)}
              onValueChange={(value) => props.onCountChange(Number(value))}
              disabled={props.disabled}
            />
          </div>

          {/* Model and key describe the connection, so they share a row. */}
          <div className='flex min-w-0 flex-wrap items-center gap-1'>
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
          </div>
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
