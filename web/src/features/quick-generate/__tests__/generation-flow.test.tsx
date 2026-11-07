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
import { StrictMode, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { generateImages, resolveApiKey } from '@/features/image-generation/api'
import { useImageApiKeys } from '@/features/image-generation/hooks/use-image-api-keys'
import type { ApiKey } from '@/features/keys/types'
import type { GenerationSchema } from '@/features/pricing/types'
import { FormNavigationGuard } from '@/features/system-settings/components/form-navigation-guard'

import { QuickGenerate } from '..'
import { submitVideo, uploadQuickGenerateReferences } from '../api'
import { useGenerationModels } from '../hooks/use-generation-models'
import { capabilityFor } from '../lib/capabilities'
import { saveComposerDraft } from '../lib/draft-storage'
import { downloadMedia } from '../lib/download-media'
import { pollVideoTask } from '../lib/poll-video'
import {
  loadRunningVideoTask,
  saveRunningVideoTask,
  type RunningVideoTask,
} from '../lib/video-task-storage'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    // A plain anchor keeps the destination visible to the assertions without
    // needing a mounted router.
    Link: (props: { to?: string; children?: ReactNode }) => (
      <a href={props.to}>{props.children}</a>
    ),
  }
})

vi.mock('@/features/image-generation/api', () => ({
  generateImages: vi.fn(),
  listEnabledApiKeys: vi.fn(),
  resolveApiKey: vi.fn(),
}))

vi.mock('@/features/image-generation/hooks/use-image-api-keys', () => ({
  useImageApiKeys: vi.fn(),
}))

vi.mock('../hooks/use-generation-models', () => ({
  useGenerationModels: vi.fn(),
}))

vi.mock('../api', () => ({
  submitVideo: vi.fn(),
  uploadQuickGenerateReferences: vi.fn(),
  fetchVideoTask: vi.fn(),
}))

// Keep the module's other exports: the result panel reads its progress parser.
vi.mock('../lib/poll-video', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/poll-video')>()
  return {
    ...actual,
    pollVideoTask: vi.fn(),
  }
})

vi.mock('../lib/download-media', () => ({
  downloadMedia: vi.fn(),
  mediaFilename: vi.fn(() => 'kiln-1.png'),
}))

// The real guard needs a router; the tests only care about its `when` flag.
vi.mock('@/features/system-settings/components/form-navigation-guard', () => ({
  FormNavigationGuard: vi.fn(() => null),
}))

const generateImagesMock = vi.mocked(generateImages)
const submitVideoMock = vi.mocked(submitVideo)
const uploadReferencesMock = vi.mocked(uploadQuickGenerateReferences)
const pollVideoTaskMock = vi.mocked(pollVideoTask)
const guardMock = vi.mocked(FormNavigationGuard)
const resolveApiKeyMock = vi.mocked(resolveApiKey)
const useGenerationModelsMock = vi.mocked(useGenerationModels)
const useImageApiKeysMock = vi.mocked(useImageApiKeys)
const downloadMediaMock = vi.mocked(downloadMedia)

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

function mockModels(
  models: {
    name: string
    kind: 'image' | 'video'
    schema?: GenerationSchema
  }[]
) {
  useGenerationModelsMock.mockReturnValue({
    models: models.map((model) => ({
      ...model,
      capability: {
        kind: model.kind,
        fields: model.schema?.fields ?? [],
        referenceImages: model.schema?.referenceImages ?? null,
        mediaNotice: model.schema?.mediaNotice ?? false,
      },
    })),
    items: models.map((model) => ({
      value: model.name,
      label: model.name,
      hint: '',
      title: undefined,
    })),
    descriptionFor: () => '',
    priceForRun: () => '',
    isLoading: false,
    error: null,
  } as ReturnType<typeof useGenerationModels>)
}

beforeEach(() => {
  // The composer keeps its draft here; one test must not seed the next.
  window.localStorage.clear()
  mockModels([
    {
      name: 'z-image',
      kind: 'image',
      schema: {
        fields: [
          { key: 'ratio', labelKey: 'Aspect Ratio', type: 'select', defaultValue: '1:1', options: [{ value: '1:1', label: '1:1' }], requestPath: ['size'] },
          { key: 'count', labelKey: 'Count', type: 'select', defaultValue: '1', options: [{ value: '1', label: '1' }], requestPath: ['n'], valueType: 'number' },
        ],
      },
    },
  ])
  useImageApiKeysMock.mockReturnValue({
    keys: [API_KEY],
    selectedKeyId: API_KEY.id,
    selectKey: vi.fn(),
    isLoading: false,
  })
  resolveApiKeyMock.mockResolvedValue('sk-abc123')
  uploadReferencesMock.mockImplementation(async (references) => references)
  downloadMediaMock.mockResolvedValue(true)
})

/** A video task the previous visit left running, with every field it needs. */
function runningTask(overrides: Partial<RunningVideoTask> = {}): RunningVideoTask {
  return {
    id: 'run-1',
    taskId: 'task-1',
    keyId: API_KEY.id,
    model: 'sora-2',
    kind: 'video',
    prompt: 'a kiln at dusk',
    values: {},
    capability: capabilityFor('video', { fields: [] }),
    references: [],
    status: 'running',
    media: [],
    saved: false,
    startedAt: 1_700_000_000_000,
    ...overrides,
  }
}

async function submitPrompt(prompt: string) {
  const editor = screen.getByRole('textbox', { name: 'Prompt' })
  editor.textContent = prompt
  fireEvent.input(editor)
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
}

describe('quick generate', () => {
  it('shows the image result in the preview frame', async () => {
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
      parameters: { size: '1:1', n: 1 },
      operation: 'generate',
    })
  })

  it('shows the video result in the preview frame', async () => {
    mockModels([
      {
        name: 'sora-2',
        kind: 'video',
        schema: {
          fields: [
            { key: 'size', labelKey: 'Size', type: 'select', defaultValue: '1280x720', options: [{ value: '1280x720', label: '1280x720' }], requestPath: ['size'] },
            { key: 'seconds', labelKey: 'Duration', type: 'number', defaultValue: 5, min: 1, max: 60, requestPath: ['duration'], valueType: 'number' },
          ],
        },
      },
    ])
    submitVideoMock.mockResolvedValue('task-1')
    pollVideoTaskMock.mockResolvedValue('https://cdn.example.com/one.mp4')

    render(<QuickGenerate />)
    await submitPrompt('a kiln at dusk')

    const video = await screen.findByLabelText('a kiln at dusk')
    expect(video.tagName).toBe('VIDEO')
    expect(video).toHaveAttribute('src', 'https://cdn.example.com/one.mp4')
    expect(submitVideoMock).toHaveBeenCalledWith({
      apiKey: 'sk-abc123',
      model: 'sora-2',
      prompt: 'a kiln at dusk',
      request: {
        size: '1280x720',
        duration: 5,
      },
    })
    expect(generateImagesMock).not.toHaveBeenCalled()
  })

  it('uploads reference video and audio as URLs for supported video models', async () => {
    mockModels([
      {
        name: 'wan3.0-video',
        kind: 'video',
        schema: {
          fields: [],
          mediaNotice: true,
        },
      },
    ])
    submitVideoMock.mockResolvedValue('task-1')
    pollVideoTaskMock.mockResolvedValue('https://cdn.example.com/one.mp4')
    uploadReferencesMock.mockImplementation(async (references) =>
      references.map((reference, index) => ({
        ...reference,
        url: `https://r2.example/reference-${index}`,
      }))
    )

    render(<QuickGenerate />)
    const videoFile = new File(['video'], 'reference.mp4', {
      type: 'video/mp4',
    })
    const audioFile = new File(['audio'], 'reference.mp3', {
      type: 'audio/mpeg',
    })
    fireEvent.change(screen.getByLabelText('Upload files'), {
      target: { files: [videoFile, audioFile] },
    })
    await submitPrompt('match the reference media')

    await waitFor(() => expect(submitVideoMock).toHaveBeenCalled())
    const request = submitVideoMock.mock.calls[0][0].request
    expect(request).toMatchObject({
      reference_videos: ['https://r2.example/reference-0'],
      reference_audios: ['https://r2.example/reference-1'],
      metadata: {
        input: { media: [
          { type: 'reference_video', url: 'https://r2.example/reference-0' },
          { type: 'reference_audio', url: 'https://r2.example/reference-1' },
        ] },
      },
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
    expect(guardMock.mock.lastCall?.[0].when).toBe(false)
  })

  it('reports a video task that fails upstream', async () => {
    mockModels([{ name: 'sora-2', kind: 'video' }])
    submitVideoMock.mockResolvedValue('task-1')
    pollVideoTaskMock.mockRejectedValue(new Error('The prompt was rejected'))

    render(<QuickGenerate />)
    await submitPrompt('a kiln at dusk')

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'The prompt was rejected'
      )
    )
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

  it('asks before a second send replaces a request that is still running', async () => {
    let finish: (urls: string[]) => void = () => undefined
    generateImagesMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )

    render(<QuickGenerate />)
    await submitPrompt('a kiln at dusk')
    await screen.findByText('Generating... 0:00')

    expect(
      screen
        .getByRole('textbox', { name: 'Prompt' })
        .closest('[data-slot=input-group]')
    ).toHaveClass('bg-muted/50')

    await submitPrompt('a second kiln')

    expect(
      await screen.findByText('Replace the current result?')
    ).toBeInTheDocument()
    expect(generateImagesMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Generate anyway' }))
    await waitFor(() => expect(generateImagesMock).toHaveBeenCalledTimes(2))
    finish(['https://cdn.example.com/one.png'])
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
      expect(downloadMediaMock).toHaveBeenCalledWith(
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

  it('keeps the model, ratio, count and key in the composer', () => {
    render(<QuickGenerate />)

    expect(screen.queryByText('No result yet')).toBeNull()
    expect(screen.getByLabelText('Model')).toHaveTextContent('z-image')
    expect(screen.getByLabelText('Aspect Ratio')).toHaveTextContent('1:1')
    expect(screen.queryByLabelText('Resolution')).toBeNull()
    expect(screen.getByLabelText('Count')).toBeInTheDocument()
    expect(screen.getByLabelText('API key')).toHaveTextContent('Quick key')
  })

  it('shows the size list declared by a channel for its public image model', () => {
    mockModels([{ name: 'renamed-image', kind: 'image', schema: {
      fields: [{ key: 'size', labelKey: 'Size', type: 'select', defaultValue: 'auto', options: [{ value: 'auto', label: 'Auto' }], requestPath: ['size'] }],
    } }])

    render(<QuickGenerate />)

    expect(screen.getByLabelText('Size')).toHaveTextContent('Auto')
    expect(screen.queryByLabelText('Count')).toBeNull()
    expect(screen.queryByLabelText('Aspect Ratio')).toBeNull()
    expect(screen.queryByLabelText('Resolution')).toBeNull()
  })

  it('shows the duration bounds declared by the channel', () => {
    mockModels([{ name: 'minimax-h3', kind: 'video', schema: {
      fields: [{ key: 'seconds', labelKey: 'Duration', type: 'number', defaultValue: 4, min: 4, max: 15, requestPath: ['duration'] }],
    } }])

    render(<QuickGenerate />)

    expect(screen.getByLabelText('Video duration')).toHaveValue(4)
    expect(screen.getByLabelText('Video duration')).toHaveAttribute('min', '4')
    expect(screen.getByLabelText('Video duration')).toHaveAttribute('max', '15')
    expect(screen.queryByLabelText('Aspect Ratio')).toBeNull()
    expect(screen.queryByLabelText('Count')).toBeNull()
    expect(screen.queryByLabelText('Resolution')).toBeNull()
    expect(screen.queryByLabelText('Size')).toBeNull()
  })

  it('offers no guessed controls when the channel has no input declaration', () => {
    mockModels([{ name: 'sora-2', kind: 'video' }])

    render(<QuickGenerate />)

    expect(screen.queryByLabelText('Video duration')).toBeNull()
    expect(screen.queryByLabelText('Aspect Ratio')).toBeNull()
  })

  it('shows resolution when the channel explicitly declares it', () => {
    mockModels([{ name: 'minimax-h3', kind: 'video', schema: {
      fields: [{ key: 'resolution', labelKey: 'Resolution', type: 'select', defaultValue: '768p', options: [{ value: '768p', label: '768p' }], requestPath: ['metadata', 'resolution'] }],
    } }])

    render(<QuickGenerate />)

    expect(screen.getByLabelText('Resolution')).toHaveTextContent('768p')
    expect(screen.queryByLabelText('Aspect Ratio')).toBeNull()
    expect(screen.queryByLabelText('Count')).toBeNull()
  })

  it('explains how to enable models when none exist', () => {
    mockModels([])

    render(<QuickGenerate />)

    expect(
      screen.getByText('No generation models are available')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
  })
  // The bar is determinate from the click on: a percentage fills it, and a
  // status word shows beside the 0% the bar starts from.
  it.each([
    { reported: '45%', value: '45', percent: '45%', status: undefined },
    { reported: 'queued', value: '0', percent: '0%', status: 'queued' },
  ])(
    'shows the reported video progress $reported as a bar',
    async ({ reported, value, percent, status }) => {
      mockModels([{ name: 'sora-2', kind: 'video' }])
      submitVideoMock.mockResolvedValue('task-1')
      pollVideoTaskMock.mockImplementation((options) => {
        options.onProgress(reported)
        return new Promise<string>(() => undefined)
      })

      render(<QuickGenerate />)
      await submitPrompt('a kiln at dusk')

      const bar = await screen.findByRole('progressbar')
      expect(bar).toHaveAttribute('aria-valuenow', value)
      expect(screen.getByText(percent)).toBeInTheDocument()
      if (status) expect(screen.getByText(status)).toBeInTheDocument()
    }
  )

  it('shows no progress bar while an image is generating', async () => {
    generateImagesMock.mockImplementation(
      () => new Promise<string[]>(() => undefined)
    )

    render(<QuickGenerate />)
    await submitPrompt('a kiln at dusk')

    expect(
      await screen.findByText(/^Generating\.\.\. \d+:\d{2}$/)
    ).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('keeps the prompt after the page is mounted again', () => {
    const view = render(<QuickGenerate />)
    const editor = screen.getByRole('textbox', { name: 'Prompt' })
    editor.textContent = 'a kiln at dusk'
    fireEvent.input(editor)
    view.unmount()

    render(<QuickGenerate />)

    expect(screen.getByRole('textbox', { name: 'Prompt' })).toHaveTextContent(
      'a kiln at dusk'
    )
  })

  it('uses the model of the last visit for the next generation', async () => {
    mockModels([
      { name: 'z-image', kind: 'image' },
      { name: 'sora-2', kind: 'video' },
    ])
    saveComposerDraft({ prompt: '', model: 'sora-2', values: {} })
    submitVideoMock.mockResolvedValue('task-1')
    pollVideoTaskMock.mockImplementation(
      () => new Promise<string>(() => undefined)
    )

    render(<QuickGenerate />)
    await submitPrompt('a kiln at dusk')

    await waitFor(() =>
      expect(submitVideoMock).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'sora-2' })
      )
    )
  })

  it('restores the parameters of the last visit', async () => {
    mockModels([
      {
        name: 'z-image',
        kind: 'image',
        schema: {
          fields: [
            {
              key: 'ratio',
              labelKey: 'Aspect Ratio',
              type: 'select',
              defaultValue: '1:1',
              options: [
                { value: '1:1', label: '1:1' },
                { value: '16:9', label: '16:9' },
              ],
              requestPath: ['size'],
            },
          ],
        },
      },
    ])
    saveComposerDraft({
      prompt: '',
      model: 'z-image',
      values: { ratio: '16:9' },
    })
    generateImagesMock.mockResolvedValue(['https://cdn.example.com/one.png'])

    render(<QuickGenerate />)
    await submitPrompt('a kiln at dusk')

    await waitFor(() =>
      expect(generateImagesMock).toHaveBeenCalledWith(
        expect.objectContaining({ parameters: { size: '16:9' } })
      )
    )
  })

  it('rejoins the video task of the last visit', async () => {
    mockModels([{ name: 'sora-2', kind: 'video' }])
    saveRunningVideoTask(runningTask({ progress: '40%' }))
    pollVideoTaskMock.mockResolvedValue('https://cdn.example.com/one.mp4')

    render(<QuickGenerate />)

    // The bar keeps the percentage the previous visit ended on, and the task
    // is forgotten once the page has its result.
    await waitFor(() =>
      expect(pollVideoTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 'task-1', startProgress: '40%' })
      )
    )
    await waitFor(() => expect(loadRunningVideoTask()).toBeNull())
  })

  it('resumes the clock of the video task from its stored start time', async () => {
    mockModels([{ name: 'sora-2', kind: 'video' }])
    saveRunningVideoTask(runningTask({ startedAt: Date.now() - 65_000 }))
    pollVideoTaskMock.mockImplementation(
      () => new Promise<string>(() => undefined)
    )

    render(<QuickGenerate />)

    expect(
      await screen.findByText(/Generating\.\.\. 1:0[56]/)
    ).toBeInTheDocument()
  })

  it('keeps the reattached task alive under StrictMode', async () => {
    mockModels([{ name: 'sora-2', kind: 'video' }])
    saveRunningVideoTask(runningTask())
    pollVideoTaskMock.mockImplementation(
      () => new Promise<string>(() => undefined)
    )

    // StrictMode mounts, unmounts and mounts again; the rehearsal must not
    // cancel the poll that reattaches to the stored task.
    render(
      <StrictMode>
        <QuickGenerate />
      </StrictMode>
    )

    await waitFor(() => expect(pollVideoTaskMock).toHaveBeenCalled())
    expect(pollVideoTaskMock.mock.calls[0][0].isCancelled()).toBe(false)
  })

  it('shows the video task this page started after a reload', async () => {
    mockModels([{ name: 'sora-2', kind: 'video' }])
    submitVideoMock.mockResolvedValue('task-1')
    pollVideoTaskMock.mockImplementation(
      () => new Promise<string>(() => undefined)
    )

    const first = render(<QuickGenerate />)
    await submitPrompt('a kiln at dusk')
    await waitFor(() => expect(loadRunningVideoTask()).not.toBeNull())
    first.unmount()

    render(<QuickGenerate />)

    expect(await screen.findByRole('progressbar')).toBeInTheDocument()
    expect(screen.getByText('Generating... 0:00')).toBeInTheDocument()
  })

  it('keeps the stored video task when the page is left while polling', () => {
    mockModels([{ name: 'sora-2', kind: 'video' }])
    saveRunningVideoTask(runningTask())
    pollVideoTaskMock.mockImplementation(
      () => new Promise<string>(() => undefined)
    )

    const view = render(<QuickGenerate />)
    view.unmount()

    expect(loadRunningVideoTask()).not.toBeNull()
  })

  it('starts the video progress bar at 0% before the first poll reports', async () => {
    mockModels([{ name: 'sora-2', kind: 'video' }])
    submitVideoMock.mockResolvedValue('task-1')
    pollVideoTaskMock.mockImplementation(
      () => new Promise<string>(() => undefined)
    )

    render(<QuickGenerate />)
    await submitPrompt('a kiln at dusk')

    const bar = await screen.findByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByText('0%')).toBeInTheDocument()
  })
})
