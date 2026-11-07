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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { generateImages, resolveApiKey } from '@/features/image-generation/api'
import { useImageApiKeys } from '@/features/image-generation/hooks/use-image-api-keys'
import { useImageModels } from '@/features/image-generation/hooks/use-image-models'
import type { ApiKey } from '@/features/keys/types'
import { FormNavigationGuard } from '@/features/system-settings/components/form-navigation-guard'

import { QuickGenerate } from '..'
import { downloadImage } from '../lib/download-image'

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

vi.mock('@/features/image-generation/hooks/use-image-models', () => ({
  useImageModels: vi.fn(),
}))

vi.mock('@/features/image-generation/hooks/use-image-api-keys', () => ({
  useImageApiKeys: vi.fn(),
}))

vi.mock('../lib/download-image', () => ({
  downloadImage: vi.fn(),
  imageFilename: vi.fn(() => 'kiln-1.png'),
}))

// The real guard needs a router; the tests only care about its `when` flag.
vi.mock('@/features/system-settings/components/form-navigation-guard', () => ({
  FormNavigationGuard: vi.fn(() => null),
}))

const generateImagesMock = vi.mocked(generateImages)
const guardMock = vi.mocked(FormNavigationGuard)
const resolveApiKeyMock = vi.mocked(resolveApiKey)
const useImageModelsMock = vi.mocked(useImageModels)
const useImageApiKeysMock = vi.mocked(useImageApiKeys)
const downloadImageMock = vi.mocked(downloadImage)

const API_KEY: ApiKey = {
  id: 7,
  name: 'Quick key',
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

beforeEach(() => {
  useImageModelsMock.mockReturnValue({
    models: ['z-image'],
    items: [{ value: 'z-image', label: 'z-image' }],
    isLoading: false,
    error: null,
  } as ReturnType<typeof useImageModels>)
  useImageApiKeysMock.mockReturnValue({
    keys: [API_KEY],
    selectedKeyId: API_KEY.id,
    selectKey: vi.fn(),
    isLoading: false,
  })
  resolveApiKeyMock.mockResolvedValue('sk-abc123')
  downloadImageMock.mockResolvedValue(true)
})

async function submitPrompt(prompt: string) {
  fireEvent.change(screen.getByLabelText('Prompt'), {
    target: { value: prompt },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
}

describe('quick generate', () => {
  it('shows the result in the preview frame', async () => {
    generateImagesMock.mockResolvedValue(['https://cdn.example.com/one.png'])

    render(<QuickGenerate />)
    await submitPrompt('a kiln at dusk')

    expect(await screen.findByText('a kiln at dusk')).toBeInTheDocument()
    expect(await screen.findByAltText('a kiln at dusk')).toHaveAttribute(
      'src',
      'https://cdn.example.com/one.png'
    )
    expect(generateImagesMock).toHaveBeenCalledWith({
      apiKey: 'sk-abc123',
      model: 'z-image',
      prompt: 'a kiln at dusk',
      size: '1024x1024',
      count: 1,
    })
  })

  it('replaces the frame contents when generation fails', async () => {
    generateImagesMock.mockRejectedValue(new Error('Upstream is busy'))

    render(<QuickGenerate />)
    await submitPrompt('a kiln at dusk')

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Upstream is busy')
    )
    expect(screen.queryByAltText('a kiln at dusk')).toBeNull()
  })

  it('retries the failed request with the parameters it used', async () => {
    generateImagesMock
      .mockRejectedValueOnce(new Error('Request failed with status code 429'))
      .mockResolvedValueOnce(['https://cdn.example.com/one.png'])

    render(<QuickGenerate />)
    await submitPrompt('a kiln at dusk')
    await screen.findByRole('alert')

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByAltText('a kiln at dusk')).toHaveAttribute(
      'src',
      'https://cdn.example.com/one.png'
    )
    expect(generateImagesMock).toHaveBeenCalledTimes(2)
    expect(generateImagesMock.mock.calls[1]?.[0]).toEqual(
      generateImagesMock.mock.calls[0]?.[0]
    )
  })

  it('asks before a second generation replaces the first', async () => {
    generateImagesMock.mockResolvedValue(['https://cdn.example.com/one.png'])

    render(<QuickGenerate />)
    await submitPrompt('a kiln at dusk')
    await screen.findByAltText('a kiln at dusk')

    await submitPrompt('a second kiln')

    expect(
      await screen.findByText('Replace the current result?')
    ).toBeInTheDocument()
    expect(generateImagesMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Generate anyway' }))

    await waitFor(() => expect(generateImagesMock).toHaveBeenCalledTimes(2))
  })

  it('downloads a result from its cell', async () => {
    generateImagesMock.mockResolvedValue(['https://cdn.example.com/one.png'])

    render(<QuickGenerate />)
    await submitPrompt('a kiln at dusk')
    await screen.findByAltText('a kiln at dusk')

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))

    await waitFor(() =>
      expect(downloadImageMock).toHaveBeenCalledWith(
        'https://cdn.example.com/one.png',
        'kiln-1.png'
      )
    )
  })

  it('warns before leaving until the result is downloaded', async () => {
    generateImagesMock.mockResolvedValue(['https://cdn.example.com/one.png'])

    render(<QuickGenerate />)
    await submitPrompt('a kiln at dusk')
    await screen.findByAltText('a kiln at dusk')

    expect(guardMock.mock.lastCall?.[0].when).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(guardMock.mock.lastCall?.[0].when).toBe(false))
  })

  it('keeps the model, size, count and key in the composer', () => {
    render(<QuickGenerate />)

    expect(screen.getByLabelText('Model')).toHaveTextContent('z-image')
    expect(screen.getByLabelText('Aspect Ratio')).toHaveTextContent('1:1')
    expect(screen.getByLabelText('Resolution')).toHaveTextContent('1K')
    expect(screen.getByLabelText('Count')).toBeInTheDocument()
    expect(screen.getByLabelText('API key')).toHaveTextContent('Quick key')
  })

  it('explains how to enable image models when none exist', () => {
    useImageModelsMock.mockReturnValue({
      models: [],
      items: [],
      isLoading: false,
      error: null,
    } as ReturnType<typeof useImageModels>)

    render(<QuickGenerate />)

    expect(
      screen.getByText('No image models are available')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
  })
})
