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
import { useReactFlow } from '@xyflow/react'
import { Copy, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { NodeAction } from '@/components/ai-elements/node'
import { Button } from '@/components/ui/button'

type NodeActionsProps = {
  nodeId: string
  /** Omitted for node kinds whose payload is too heavy to duplicate. */
  onDuplicate?: () => void
}

/**
 * Header actions shared by every canvas node.
 *
 * Deleting also drops the edges attached to the node, which React Flow does
 * for us; updates flow back through `onNodesChange`, so the saved canvas
 * follows without extra bookkeeping.
 */
export function NodeActions(props: NodeActionsProps) {
  const { t } = useTranslation()
  const { deleteElements } = useReactFlow()

  return (
    <NodeAction className='flex items-center gap-0.5'>
      {props.onDuplicate && (
        <Button
          type='button'
          variant='ghost'
          size='icon-xs'
          className='nodrag'
          aria-label={t('Duplicate')}
          title={t('Duplicate')}
          onClick={props.onDuplicate}
        >
          <Copy aria-hidden='true' />
        </Button>
      )}
      <Button
        type='button'
        variant='ghost'
        size='icon-xs'
        className='nodrag'
        aria-label={t('Delete')}
        title={t('Delete')}
        onClick={() => deleteElements({ nodes: [{ id: props.nodeId }] })}
      >
        <Trash2 aria-hidden='true' />
      </Button>
    </NodeAction>
  )
}
