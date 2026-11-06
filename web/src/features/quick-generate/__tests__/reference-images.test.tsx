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
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ApiKey } from '@/features/keys/types'

import { GenerateComposer } from '../components/generate-composer'
import { capabilityFor, defaultValues } from '../lib/capabilities'

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
