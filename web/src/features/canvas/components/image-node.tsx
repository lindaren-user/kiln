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
import type { NodeProps } from '@xyflow/react'
import { useTranslation } from 'react-i18next'

import {
  Node,
  NodeContent,
  NodeDescription,
  NodeHeader,
  NodeTitle,
} from '@/components/ai-elements/node'
import { cn } from '@/lib/utils'

import type { ImageNode as ImageNodeType } from '../types'
import { NodeActions } from './node-actions'

export function ImageNode(props: NodeProps<ImageNodeType>) {
  const { t } = useTranslation()

  return (
    <Node handles={{ target: true, source: false }} className='w-96'>
      <NodeHeader>
        <NodeTitle>{props.data.model}</NodeTitle>
        {/* No duplicate action: the payload is inline image data. */}
        <NodeActions nodeId={props.id} />
        <NodeDescription className='line-clamp-2'>
          {props.data.prompt}
        </NodeDescription>
      </NodeHeader>
      <NodeContent
        className={cn(
          'nodrag nowheel grid gap-2',
          props.data.images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
        )}
      >
        {props.data.images.map((image) => (
          <a
            key={image}
            href={image}
            target='_blank'
            rel='noopener noreferrer'
            className='bg-muted block overflow-hidden rounded-md'
          >
            <img
              src={image}
              alt={props.data.prompt || t('Generated image')}
              loading='lazy'
              className='size-full object-cover'
            />
          </a>
        ))}
      </NodeContent>
    </Node>
  )
}
