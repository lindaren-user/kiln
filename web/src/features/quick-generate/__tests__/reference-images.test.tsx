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
import { render, screen } from '@testing-library/react'
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

function renderComposer(model: string, kind: 'image' | 'video') {
  const capability = capabilityFor(model, kind)
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
    renderComposer('sora-2', 'video')

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

  it('accepts any media type for a model that reads reference video and audio', () => {
    renderComposer('wan3.0-video', 'video')

    expect(
      screen.getByRole('button', { name: 'Add reference media' })
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Upload files')).not.toHaveAttribute('accept')
  })

  it('keeps the picker for a speech-to-video model that also needs audio', () => {
    renderComposer('wan2.2-s2v', 'video')

    expect(
      screen.getByRole('button', { name: 'Add reference media' })
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Upload files')).not.toHaveAttribute('accept')
  })
})
