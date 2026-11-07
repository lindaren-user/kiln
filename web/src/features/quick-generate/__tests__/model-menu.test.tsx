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
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiKey } from '@/features/keys/types'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import type { GenerationSchema, PricingModel } from '@/features/pricing/types'

import { GenerateComposer } from '../components/generate-composer'
import { useGenerationModels } from '../hooks/use-generation-models'
import { capabilityFor, defaultValues } from '../lib/capabilities'

vi.mock('@/features/pricing/hooks/use-pricing-data', () => ({
  usePricingData: vi.fn(),
}))

const usePricingDataMock = vi.mocked(usePricingData)

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

function imageModel(
  modelName: string,
  description?: string,
  generationSchema?: GenerationSchema
): PricingModel {
  return {
    id: 1,
    model_name: modelName,
    quota_type: 1,
    model_ratio: 0,
    completion_ratio: 0,
    enable_groups: ['default'],
    supported_endpoint_types: ['image-generation'],
    description,
    generation_schemas: generationSchema
      ? { image: generationSchema }
      : undefined,
  }
}

function MenuHarness() {
  const { items, models } = useGenerationModels()
  const selected = models[0]
  const model = selected?.name ?? ''
  const capability = selected?.capability ?? capabilityFor('image')
  return (
    <GenerateComposer
      modelItems={items}
      model={model}
      promptPlaceholder=''
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

beforeEach(() => {
  usePricingDataMock.mockReturnValue({
    models: [
      imageModel('seedance2.5', '  Cinema video  '),
      imageModel('plain', '   ', {
        fields: [
          {
            key: 'size',
            labelKey: 'Size',
            type: 'select',
            defaultValue: '1:1',
            options: [{ value: '1:1', label: '1:1' }],
            requestPath: ['size'],
          },
        ],
      }),
    ].map((model) => ({
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
  })
})

describe('quick generate model menu', () => {
  it('shows the model description as the option title', async () => {
    const user = userEvent.setup()
    render(<MenuHarness />)

    await user.click(screen.getByRole('combobox', { name: 'Model' }))

    expect(
      screen.getByRole('option', { name: /seedance2\.5/ })
    ).toHaveAttribute('title', 'Cinema video')
    expect(screen.getByRole('option', { name: /^plain/ })).not.toHaveAttribute(
      'title'
    )
  })

  it('renders only the parameters supplied by the pricing schema', () => {
    render(<MenuHarness />)

    expect(screen.getByLabelText('Size')).toHaveTextContent('1:1')
    expect(screen.queryByLabelText('Aspect Ratio')).toBeNull()
  })
})
