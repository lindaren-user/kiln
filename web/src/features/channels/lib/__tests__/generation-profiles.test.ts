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
import { describe, expect, test } from 'vitest'

import type { Channel } from '../../types'
import {
  CHANNEL_FORM_DEFAULT_VALUES,
  channelFormSchema,
  transformChannelToFormDefaults,
  transformFormDataToCreatePayload,
} from '../channel-form'

const PROFILES = [
  {
    kind: 'image',
    models: ['gpt-image-1'],
    fields: [
      {
        key: 'size',
        labelKey: 'Size',
        type: 'select',
        defaultValue: '1024x1024',
        options: [{ value: '1024x1024', label: '1024x1024' }],
        requestPath: ['size'],
      },
    ],
  },
]

function channelWithProfiles(profiles: unknown): Channel {
  return {
    id: 1,
    type: 1,
    name: 'CodeKey',
    base_url: 'https://api.example.com',
    models: 'gpt-image-1',
    channel_info: {},
    settings: JSON.stringify({ generation_profiles: profiles }),
  } as Channel
}

describe('channel generation profiles', () => {
  test('loads a stored declaration into the editor', () => {
    const form = transformChannelToFormDefaults(channelWithProfiles(PROFILES))

    expect(JSON.parse(form.generation_profiles ?? '')).toEqual(PROFILES)
  })

  test('writes the declaration back into the channel settings', () => {
    const form = {
      ...CHANNEL_FORM_DEFAULT_VALUES,
      name: 'CodeKey',
      type: 1,
      base_url: 'https://api.example.com',
      key: 'test-key',
      models: 'gpt-image-1',
      generation_profiles: JSON.stringify(PROFILES),
    }

    const { channel } = transformFormDataToCreatePayload(form)

    expect(JSON.parse(String(channel.settings)).generation_profiles).toEqual(
      PROFILES
    )
  })

  test('removes the declaration when the editor is cleared', () => {
    const form = {
      ...CHANNEL_FORM_DEFAULT_VALUES,
      name: 'CodeKey',
      type: 1,
      base_url: 'https://api.example.com',
      key: 'test-key',
      models: 'gpt-image-1',
      settings: JSON.stringify({ generation_profiles: PROFILES, proxy: 'x' }),
      generation_profiles: '',
    }

    const { channel } = transformFormDataToCreatePayload(form)
    const settings = JSON.parse(String(channel.settings))

    expect(settings).not.toHaveProperty('generation_profiles')
    expect(settings.proxy).toBe('x')
  })

  test('rejects a declaration that is not a JSON array', () => {
    const form = {
      ...CHANNEL_FORM_DEFAULT_VALUES,
      name: 'CodeKey',
      generation_profiles: '{"kind":"image"}',
    }

    expect(channelFormSchema.safeParse(form).success).toBe(false)
  })
})
