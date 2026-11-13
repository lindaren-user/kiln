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
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiKey } from '@/features/keys/types'

import { GenerateComposer } from '../components/generate-composer'
import { capabilityFor, defaultValues } from '../lib/capabilities'
import {
  loadReferenceFiles,
  saveReferenceFiles,
} from '../lib/reference-storage'
import type { ReferenceAttachment } from '../types'

// IndexedDB is the boundary this component talks to; the module around it is
// tested against the real storage in a browser only.
vi.mock('../lib/reference-storage', () => ({
  loadReferenceFiles: vi.fn(),
  saveReferenceFiles: vi.fn(),
}))

const loadReferenceFilesMock = vi.mocked(loadReferenceFiles)
const saveReferenceFilesMock = vi.mocked(saveReferenceFiles)

beforeEach(() => {
  loadReferenceFilesMock.mockReset()
  saveReferenceFilesMock.mockReset()
  loadReferenceFilesMock.mockResolvedValue([])
  saveReferenceFilesMock.mockResolvedValue(undefined)
})

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

function renderComposer(
  model: string,
  kind: 'image' | 'video',
  options: {
    referenceImages?: {
      max: number
      field: 'image' | 'images'
      encoding: 'dataUrl' | 'base64'
    }
    mediaNotice?: boolean
  } = {}
) {
  const capability = capabilityFor(kind, { fields: [], ...options })
  render(
    <GenerateComposer
      modelItems={[{ value: model, label: model }]}
      model={model}
      promptPlaceholder='Describe what you want to create'
      onModelChange={vi.fn()}
      capability={capability}
      prompt=''
      onPromptChange={vi.fn()}
      values={defaultValues(capability)}
      onValueChange={vi.fn()}
      keys={[API_KEY]}
      selectedKeyId={API_KEY.id}
      onKeyChange={vi.fn()}
      onSubmit={() => true}
      busy={false}
      disabled={false}
    />
  )
}

/** Drop files on the composer the way a browser delivers them. */
function dropFiles(files: File[]) {
  const form = document.querySelector('form')
  if (!(form instanceof HTMLFormElement)) throw new Error('composer form')
  fireEvent.drop(form, { dataTransfer: { files, types: ['Files'] } })
}

/** A composer whose prompt is editable, so a typed mention reaches submit. */
function SubmitHarness(props: {
  onSubmit: (prompt: string, references: ReferenceAttachment[]) => void
}) {
  const [prompt, setPrompt] = useState('')
  const capability = capabilityFor('video', {
    fields: [],
    mediaNotice: true,
    referenceImages: { max: 3, field: 'images', encoding: 'dataUrl' },
  })
  return (
    <GenerateComposer
      modelItems={[{ value: 'wan3.0-video', label: 'wan3.0-video' }]}
      model='wan3.0-video'
      promptPlaceholder='Describe what you want to create'
      onModelChange={vi.fn()}
      capability={capability}
      prompt={prompt}
      onPromptChange={setPrompt}
      values={defaultValues(capability)}
      onValueChange={vi.fn()}
      keys={[API_KEY]}
      selectedKeyId={API_KEY.id}
      onKeyChange={vi.fn()}
      onSubmit={(value, references) => {
        props.onSubmit(value, references)
        return true
      }}
      busy={false}
      disabled={false}
    />
  )
}

describe('submitting mentions', () => {
  /** Uploads an image and an audio file, then walks a mention of each. */
  async function renderMentionedPrompt(onSubmit = vi.fn()) {
    render(<SubmitHarness onSubmit={onSubmit} />)
    await waitFor(() => expect(loadReferenceFilesMock).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText('Upload files'), {
      target: {
        files: [
          new File(['a'], 'cat.png', { type: 'image/png' }),
          new File(['b'], 'voice.mp3', { type: 'audio/mpeg' }),
        ],
      },
    })

    const editor = screen.getByRole('textbox', { name: 'Prompt' })
    editor.textContent = 'animate @cat.png with @voice.mp3'
    fireEvent.input(editor)
    return onSubmit
  }

  it('refers to the references by kind and number', async () => {
    const onSubmit = await renderMentionedPrompt()
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.lastCall?.[0]).toBe('animate Image 1 with Audio 1')
    expect(
      onSubmit.mock.lastCall?.[1].map(
        (reference: ReferenceAttachment) => reference.filename
      )
    ).toEqual(['cat.png', 'voice.mp3'])
  })

  it('counts the mentions as the labels that are sent', async () => {
    await renderMentionedPrompt()

    // File names are replaced by "Image 1" and "Audio 1" before sending.
    expect(await screen.findByText('28 / 6,000')).toBeInTheDocument()
  })
})

describe('reference persistence', () => {
  const IMAGE_REFERENCE = {
    referenceImages: {
      max: 1,
      field: 'images' as const,
      encoding: 'dataUrl' as const,
    },
  }

  it('puts back the references of the previous visit', async () => {
    loadReferenceFilesMock.mockResolvedValue([
      new File(['img'], 'cat.png', { type: 'image/png' }),
    ])

    renderComposer('sora-2', 'video', IMAGE_REFERENCE)

    expect(await screen.findByTitle('cat.png')).toBeInTheDocument()
    // The restored files came from storage; writing them straight back adds
    // nothing and could only fail on a full disk.
    expect(saveReferenceFilesMock).not.toHaveBeenCalled()
  })

  it('stores the references as they change', async () => {
    renderComposer('sora-2', 'video', IMAGE_REFERENCE)
    await waitFor(() => expect(loadReferenceFilesMock).toHaveBeenCalled())

    dropFiles([new File(['img'], 'frame.png', { type: 'image/png' })])

    await waitFor(() => expect(saveReferenceFilesMock).toHaveBeenCalled())
    expect(
      saveReferenceFilesMock.mock.lastCall?.[0].map((file) => file.filename)
    ).toEqual(['frame.png'])
  })
})

describe('reference media upload', () => {
  it('offers an image-only picker when the model accepts reference images', () => {
    renderComposer('sora-2', 'video', {
      referenceImages: { max: 1, field: 'images', encoding: 'dataUrl' },
    })

    expect(
      screen.getByRole('button', { name: 'Add reference media' })
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Upload files')).toHaveAttribute(
      'accept',
      'image/*'
    )
  })

  it('hides the picker on a text-only image model', () => {
    renderComposer('dall-e-3', 'image')

    expect(
      screen.queryByRole('button', { name: 'Add reference media' })
    ).toBeNull()
  })

  it('offers only video and audio for a model that reads reference video and audio', () => {
    renderComposer('wan2.2-s2v', 'video', { mediaNotice: true })

    expect(
      screen.getByRole('button', { name: 'Add reference media' })
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Upload files')).toHaveAttribute(
      'accept',
      'video/*,audio/*'
    )

    fireEvent.change(screen.getByLabelText('Upload files'), {
      target: {
        files: [new File(['img'], 'frame.png', { type: 'image/png' })],
      },
    })
    expect(screen.queryByTitle('frame.png')).toBeNull()
  })

  it('offers images, video and audio when the model declares both', () => {
    renderComposer('wan3.0-video', 'video', {
      mediaNotice: true,
      referenceImages: { max: 1, field: 'images', encoding: 'dataUrl' },
    })

    expect(screen.getByLabelText('Upload files')).toHaveAttribute(
      'accept',
      'image/*,video/*,audio/*'
    )
  })

  it('accepts a dropped reference on the composer', () => {
    renderComposer('sora-2', 'video', {
      referenceImages: { max: 1, field: 'images', encoding: 'dataUrl' },
    })

    dropFiles([
      new File(['img'], 'frame.png', { type: 'image/png' }),
      new File(['vid'], 'clip.mp4', { type: 'video/mp4' }),
    ])

    expect(screen.getByTitle('frame.png')).toBeInTheDocument()
    // The model accepts images only, so the dropped clip stays out.
    expect(screen.queryByTitle('clip.mp4')).toBeNull()
  })

  it('caps a drop at the model reference allowance', () => {
    renderComposer('sora-2', 'video', {
      referenceImages: { max: 1, field: 'images', encoding: 'dataUrl' },
    })

    dropFiles([
      new File(['a'], 'first.png', { type: 'image/png' }),
      new File(['b'], 'second.png', { type: 'image/png' }),
    ])

    expect(screen.getByTitle('first.png')).toBeInTheDocument()
    expect(screen.queryByTitle('second.png')).toBeNull()
  })

  it('keeps the earlier reference previewable after another one is added', () => {
    // The preview reads the object URL of every attachment, so adding a file
    // must not revoke the URLs of the files already in the list.
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    renderComposer('wan2.2-s2v', 'video', { mediaNotice: true })
    const picker = screen.getByLabelText('Upload files')

    fireEvent.change(picker, {
      target: { files: [new File(['a'], 'first.mp4', { type: 'video/mp4' })] },
    })
    fireEvent.change(picker, {
      target: { files: [new File(['b'], 'second.mp4', { type: 'video/mp4' })] },
    })

    expect(screen.getByTitle('first.mp4')).toBeInTheDocument()
    expect(screen.getByTitle('second.mp4')).toBeInTheDocument()
    expect(revoke).not.toHaveBeenCalled()
    revoke.mockRestore()
  })

  it('drops documents and keeps only declared media files', () => {
    renderComposer('wan3.0-video', 'video', {
      mediaNotice: true,
      referenceImages: { max: 3, field: 'images', encoding: 'dataUrl' },
    })

    fireEvent.change(screen.getByLabelText('Upload files'), {
      target: {
        files: [
          new File(['doc'], 'notes.pdf', { type: 'application/pdf' }),
          new File(['img'], 'frame.png', { type: 'image/png' }),
          new File(['vid'], 'clip.mp4', { type: 'video/mp4' }),
          new File(['voice'], 'voice.mp3', { type: 'audio/mpeg' }),
        ],
      },
    })

    expect(screen.queryByTitle('notes.pdf')).toBeNull()
    expect(screen.getByTitle('frame.png')).toBeInTheDocument()
    expect(screen.getByTitle('clip.mp4')).toBeInTheDocument()
    expect(screen.getByTitle('voice.mp3')).toBeInTheDocument()
  })
})
