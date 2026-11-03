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
import {
  addEdge,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
} from '@xyflow/react'
import { TriangleAlert } from 'lucide-react'
import { nanoid } from 'nanoid'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Canvas } from '@/components/ai-elements/canvas'
import { Panel } from '@/components/ai-elements/panel'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { generateImages, resolveApiKey } from '@/features/image-generation/api'
import { useImageApiKeys } from '@/features/image-generation/hooks/use-image-api-keys'
import { useImageModels } from '@/features/image-generation/hooks/use-image-models'

import { CanvasContext } from './canvas-context'
import { CanvasToolbar } from './components/canvas-toolbar'
import { ImageNode } from './components/image-node'
import { PromptNode } from './components/prompt-node'
import { DEFAULT_PROMPT_DATA, PROMPT_NODE_WIDTH } from './constants'
import { loadCanvas, saveCanvas } from './lib/canvas-storage'
import type { CanvasNode, ImageNode as ImageNodeType } from './types'

const NODE_TYPES = { prompt: PromptNode, image: ImageNode }

export function CanvasWorkspace() {
  return (
    <ReactFlowProvider>
      <CanvasBoard />
    </ReactFlowProvider>
  )
}

function CanvasBoard() {
  const { t } = useTranslation()
  const [initialCanvas] = useState(loadCanvas)
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(
    initialCanvas.nodes
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialCanvas.edges)
  const { getNode, getNodes, updateNodeData } = useReactFlow<CanvasNode>()

  // Shared pricing cache and key picker, also used by quick generation.
  const { models, items: modelItems, isLoading, error } = useImageModels()
  const { keys, selectedKeyId, selectKey } = useImageApiKeys()

  // A restored canvas may predate the catalog: give its prompt nodes the
  // first available model so the Generate action is usable straight away.
  useEffect(() => {
    const fallback = models[0]
    if (!fallback) return
    setNodes((current) =>
      current.some((node) => node.type === 'prompt' && !node.data.model)
        ? current.map((node) =>
            node.type === 'prompt' && !node.data.model
              ? { ...node, data: { ...node.data, model: fallback } }
              : node
          )
        : current
    )
  }, [models, setNodes])

  useEffect(() => {
    const timer = window.setTimeout(() => saveCanvas({ nodes, edges }), 400)
    return () => window.clearTimeout(timer)
  }, [nodes, edges])

  const handleAddPrompt = useCallback(() => {
    const offset = (getNodes().length % 6) * 48
    const nodeId = `prompt-${nanoid()}`
    setNodes((current) => [
      ...current,
      {
        id: nodeId,
        type: 'prompt',
        position: { x: 120 + offset, y: 120 + offset },
        data: { ...DEFAULT_PROMPT_DATA, model: models[0] ?? '' },
      },
    ])
  }, [getNodes, models, setNodes])

  const handleClear = useCallback(() => {
    setNodes([])
    setEdges([])
  }, [setNodes, setEdges])

  const generate = useCallback(
    async (nodeId: string) => {
      const node = getNode(nodeId)
      if (!node || node.type !== 'prompt') return
      if (selectedKeyId === null) {
        updateNodeData(nodeId, {
          status: 'error',
          error: t('Select an API key before generating'),
        })
        return
      }

      const { model, prompt, size, count } = node.data
      updateNodeData(nodeId, { status: 'running', error: undefined })

      try {
        const apiKey = await resolveApiKey(selectedKeyId)
        const images = await generateImages({
          apiKey,
          model,
          prompt,
          size,
          count,
        })
        updateNodeData(nodeId, { status: 'idle' })

        const imageNode: ImageNodeType = {
          id: `image-${nanoid()}`,
          type: 'image',
          position: {
            x:
              node.position.x +
              (node.measured?.width ?? PROMPT_NODE_WIDTH) +
              80,
            y: node.position.y,
          },
          data: { images, model, prompt },
        }
        setNodes((current) => [...current, imageNode])
        setEdges((current) => [
          ...current,
          {
            id: `edge-${nanoid()}`,
            source: nodeId,
            target: imageNode.id,
            animated: true,
          },
        ])
      } catch (error) {
        updateNodeData(nodeId, {
          status: 'error',
          error:
            error instanceof Error
              ? error.message
              : t('Image generation failed'),
        })
      }
    },
    [getNode, selectedKeyId, setEdges, setNodes, t, updateNodeData]
  )

  const handleConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) => addEdge({ ...connection, animated: true }, current))
    },
    [setEdges]
  )

  const contextValue = useMemo(
    () => ({ modelItems, generate }),
    [modelItems, generate]
  )

  const noModels = !isLoading && !error && models.length === 0

  return (
    <div className='relative size-full'>
      <CanvasContext.Provider value={contextValue}>
        <Canvas
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          panOnDrag
          selectionOnDrag={false}
        >
          <Panel position='top-left'>
            <CanvasToolbar
              keys={keys}
              selectedKeyId={selectedKeyId}
              onKeyChange={selectKey}
              onAddPrompt={handleAddPrompt}
              onClear={handleClear}
              canClear={nodes.length > 0}
            />
          </Panel>

          {noModels && (
            <Panel position='top-center'>
              <Alert className='bg-card w-[min(28rem,calc(100vw-4rem))] shadow-md'>
                <TriangleAlert />
                <AlertTitle>{t('No image models are available')}</AlertTitle>
                <AlertDescription>
                  {t(
                    'Add a channel that supports image generation, then reload this page.'
                  )}
                </AlertDescription>
              </Alert>
            </Panel>
          )}

          {nodes.length === 0 && !noModels && (
            <Panel position='bottom-center'>
              <p className='text-muted-foreground px-2 py-1 text-xs'>
                {t('Add a prompt node to start creating')}
              </p>
            </Panel>
          )}
        </Canvas>
      </CanvasContext.Provider>
    </div>
  )
}
