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
import { useReactFlow, type NodeProps } from '@xyflow/react'
import { Loader2, Sparkles } from 'lucide-react'
import { nanoid } from 'nanoid'
import { useTranslation } from 'react-i18next'

import {
  Node,
  NodeContent,
  NodeFooter,
  NodeHeader,
  NodeTitle,
} from '@/components/ai-elements/node'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  IMAGE_COUNT_ITEMS,
  IMAGE_SIZE_ITEMS,
} from '@/features/image-generation/constants'

import { useCanvasContext } from '../canvas-context'
import type { PromptNode as PromptNodeType } from '../types'
import { NodeActions } from './node-actions'

export function PromptNode(props: NodeProps<PromptNodeType>) {
  const { t } = useTranslation()
  const { modelItems, generate } = useCanvasContext()
  const { updateNodeData, getNode, addNodes } = useReactFlow<PromptNodeType>()

  const running = props.data.status === 'running'

  const duplicate = () => {
    const node = getNode(props.id)
    if (!node) return
    addNodes({
      id: `prompt-${nanoid()}`,
      type: 'prompt',
      position: { x: node.position.x + 48, y: node.position.y + 48 },
      data: { ...node.data, status: 'idle', error: undefined },
    })
  }

  return (
    <Node handles={{ target: false, source: true }} className='w-80'>
      <NodeHeader>
        <NodeTitle>{t('Prompt')}</NodeTitle>
        <NodeActions nodeId={props.id} onDuplicate={duplicate} />
      </NodeHeader>

      <NodeContent className='space-y-2'>
        <Textarea
          className='nodrag nowheel min-h-20 resize-none'
          rows={3}
          value={props.data.prompt}
          placeholder={t('Describe the image you want')}
          aria-label={t('Prompt')}
          disabled={running}
          onChange={(event) =>
            updateNodeData(props.id, { prompt: event.target.value })
          }
        />

        <div className='grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2'>
          <Select
            items={modelItems}
            value={props.data.model}
            onValueChange={(value) =>
              updateNodeData(props.id, { model: String(value) })
            }
            disabled={running}
          >
            <SelectTrigger
              className='nodrag w-full min-w-0'
              aria-label={t('Model')}
              size='sm'
            >
              <SelectValue placeholder={t('Select a model')} />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {modelItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            items={IMAGE_SIZE_ITEMS}
            value={props.data.size}
            onValueChange={(value) =>
              updateNodeData(props.id, { size: String(value) })
            }
            disabled={running}
          >
            <SelectTrigger
              className='nodrag w-full min-w-0'
              aria-label={t('Size')}
              size='sm'
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {IMAGE_SIZE_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            items={IMAGE_COUNT_ITEMS}
            value={String(props.data.count)}
            onValueChange={(value) =>
              updateNodeData(props.id, { count: Number(value) })
            }
            disabled={running}
          >
            <SelectTrigger
              className='nodrag w-full min-w-0'
              aria-label={t('Images')}
              size='sm'
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {IMAGE_COUNT_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {props.data.error && (
          <p className='text-destructive text-xs' role='alert'>
            {props.data.error}
          </p>
        )}
      </NodeContent>

      <NodeFooter>
        <Button
          className='w-full'
          size='sm'
          disabled={
            running || !props.data.model || props.data.prompt.trim() === ''
          }
          onClick={() => generate(props.id)}
        >
          {running ? (
            <Loader2 className='animate-spin' aria-hidden='true' />
          ) : (
            <Sparkles aria-hidden='true' />
          )}
          {running ? t('Generating') : t('Generate')}
        </Button>
      </NodeFooter>
    </Node>
  )
}
