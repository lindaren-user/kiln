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
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Pricing } from '..'
import type { PricingModel } from '../types'

const mock = vi.hoisted(() => {
  const model: PricingModel = {
    id: 1,
    model_name: 'kiln-seedance2.5-B1',
    description: '720P, 4-15s',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
  }
  return {
    model,
    data: {
      models: [model],
      vendors: [],
      groupRatio: {},
      usableGroup: {},
      endpointMap: {},
      autoGroups: [],
      isLoading: false,
      priceRate: 1,
      usdExchangeRate: 7,
    },
  }
})

// The page reads its search state from the route; the layout under test does
// not depend on it.
vi.mock('@tanstack/react-router', () => ({ useSearch: () => ({}) }))

// Everything below is unrelated to the layout: the drawer, its charts, the
// transition wrapper, and the performance metrics the table asks for.
vi.mock('@/components/layout', () => ({
  PublicLayout: (props: { children: ReactNode }) => props.children,
}))
vi.mock('@/components/page-transition', () => ({
  PageTransition: (props: { children: ReactNode }) => props.children,
}))
vi.mock('../components/model-details', () => ({
  ModelDetails: () => null,
  ModelDetailsContent: () => null,
  ModelDetailsDrawer: () => null,
}))
vi.mock('@/features/performance-metrics/api', () => ({
  getPerfMetricsSummary: async () => ({ success: true, data: { models: [] } }),
}))
vi.mock('../hooks/use-pricing-data', () => ({
  usePricingData: () => mock.data,
}))

function renderPage() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Pricing />
    </QueryClientProvider>
  )
}

describe('model square layout', () => {
  // The filter panel used to sit in its own left column; every filter now
  // lives behind the toolbar's Filter button, so the page is one column and
  // the toolbar button has to be reachable at every width.
  it('renders one column and keeps the filters behind the toolbar button', async () => {
    renderPage()

    expect(screen.getByText(mock.model.model_name)).toBeVisible()
    expect(document.querySelector('aside')).toBeNull()
    expect(
      screen.queryByText('Refine models by provider, group, type, and tags.')
    ).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Filter' }))

    const sheet = await screen.findByRole('dialog')
    expect(
      within(sheet).getByText(
        'Refine models by provider, group, type, and tags.'
      )
    ).toBeVisible()
  })
})
