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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  generateImages,
  listEnabledApiKeys,
  resolveApiKey,
} from '@/features/image-generation/api'
import type { ApiKey } from '@/features/keys/types'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import type { PricingModel } from '@/features/pricing/types'

import { CanvasWorkspace } from '..'
import { CANVAS_STORAGE_KEY } from '../constants'

// The workspace is rendered without a router; the toolbar's keys shortcut is
// the only link in the tree.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: (props: { children?: ReactNode }) => <a>{props.children}</a>,
  }
})

vi.mock('@/features/image-generation/api', () => ({
  generateImages: vi.fn(),
  listEnabledApiKeys: vi.fn(),
  resolveApiKey: vi.fn(),
}))

vi.mock('@/features/pricing/hooks/use-pricing-data', () => ({
  usePricingData: vi.fn(),
}))

const generateImagesMock = vi.mocked(generateImages)
const listEnabledApiKeysMock = vi.mocked(listEnabledApiKeys)
const resolveApiKeyMock = vi.mocked(resolveApiKey)
const usePricingDataMock = vi.mocked(usePricingData)

const API_KEY: ApiKey = {
  id: 7,
  name: 'Canvas key',
  key: 'abc**********xyz',
  status: 1,
  remain_quota: 0,
  used_quota: 0,
  unlimited_quota: true,
  expired_time: -1,
  created_time: 0,
  accessed_time: 0,
  group: '',
  auto_groups: null,
  cross_group_retry: false,
  model_limits_enabled: false,
  model_limits: '',
  allow_ips: '',
  allow_user_quota_query: false,
}

function imageModel(modelName: string): PricingModel {
  return {
    id: 1,
    model_name: modelName,
    quota_type: 1,
    model_ratio: 0,
    completion_ratio: 0,
    enable_groups: ['default'],
    supported_endpoint_types: ['image-generation'],
  }
}

function pricingResult(
  models: PricingModel[]
): ReturnType<typeof usePricingData> {
  return {
    models: models.map((model) => ({
      ...model,
      key: model.model_name,
      vendor_name: undefined,
      vendor_icon: undefined,
      vendor_description: undefined,
      group_ratio: {},
    })),
    vendors: [],
    groupRatio: {},
    usableGroup: {},
    endpointMap: {},
    autoGroups: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    priceRate: 1,
    usdExchangeRate: 1,
  }
}

function seedPromptNode() {
  window.localStorage.setItem(
    CANVAS_STORAGE_KEY,
    JSON.stringify({
      nodes: [
        {
          id: 'prompt-1',
          type: 'prompt',
          position: { x: 0, y: 0 },
          data: {
            model: 'z-image',
            prompt: 'a kiln at dusk',
            size: '1024x1024',
            count: 1,
            status: 'idle',
          },
        },
      ],
      edges: [],
    })
  )
}

function renderCanvas() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <CanvasWorkspace />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  usePricingDataMock.mockReturnValue(pricingResult([imageModel('z-image')]))
  listEnabledApiKeysMock.mockResolvedValue([API_KEY])
  resolveApiKeyMock.mockResolvedValue('sk-abc123')
})

afterEach(() => {
  window.localStorage.clear()
  vi.clearAllMocks()
})

describe('canvas workspace', () => {
  it('generates from a restored prompt node and places the result on the canvas', async () => {
    seedPromptNode()
    generateImagesMock.mockResolvedValue(['https://cdn.example.com/one.png'])

    renderCanvas()

    // The connection picker resolves before generation can start.
    await screen.findByText('Canvas key')

    // React Flow keeps nodes hidden until it measures them, which jsdom
    // cannot do, so the click is dispatched without user-event's
    // visibility and pointer-events checks.
    fireEvent.click(await screen.findByText('Generate'))

    // Resolving the secret adds a tick before the request goes out.
    await waitFor(() =>
      expect(generateImagesMock).toHaveBeenCalledWith({
        apiKey: 'sk-abc123',
        model: 'z-image',
        prompt: 'a kiln at dusk',
        size: '1024x1024',
        count: 1,
      })
    )
    expect(resolveApiKeyMock).toHaveBeenCalledWith(7)
    expect(await screen.findByAltText('a kiln at dusk')).toHaveAttribute(
      'src',
      'https://cdn.example.com/one.png'
    )
  })

  it('explains how to enable image models without covering the workspace', async () => {
    usePricingDataMock.mockReturnValue(pricingResult([]))

    renderCanvas()

    const notice = await screen.findByRole('alert')
    expect(notice).toHaveTextContent('No image models are available')
    // The notice lives in the flow's overlay panel, not over the nodes.
    expect(notice.closest('.react-flow__panel')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'New prompt' })).toBeVisible()
  })

  it('keeps the model in the same parameter row as size and count', async () => {
    seedPromptNode()
    renderCanvas()

    await screen.findByText('Canvas key')

    const model = screen.getByLabelText('Model')
    const size = screen.getByLabelText('Size')
    const images = screen.getByLabelText('Images')
    expect(size.parentElement).toBe(model.parentElement)
    expect(images.parentElement).toBe(model.parentElement)
  })

  it('duplicates and deletes a prompt node from its header', async () => {
    seedPromptNode()
    renderCanvas()

    await screen.findByText('Canvas key')
    // One per prompt node; the icon is aria-hidden, so the label is the text.
    const generateButtons = () => screen.queryAllByText('Generate')
    await waitFor(() => expect(generateButtons()).toHaveLength(1))

    // React Flow marks its nodes aria-hidden, so query by label text rather
    // than by role.
    fireEvent.click(screen.getByLabelText('Duplicate'))
    await waitFor(() => expect(generateButtons()).toHaveLength(2))

    fireEvent.click(screen.getAllByLabelText('Delete')[0])
    await waitFor(() => expect(generateButtons()).toHaveLength(1))
  })

  it('adds a prompt node when the toolbar button is used', async () => {
    renderCanvas()

    fireEvent.click(screen.getByRole('button', { name: 'New prompt' }))

    // React Flow nodes have no measurable size in jsdom, so assert the node is
    // mounted rather than painted.
    expect(screen.getByText('Prompt')).toBeInTheDocument()
  })
})
