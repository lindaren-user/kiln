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
import { describe, expect, it } from 'vitest'

import { DataTableView, useDataTable } from '@/components/data-table'

import { usePricingColumns } from '../components/pricing-columns'
import {
  AVERAGE_LATENCY_HINT,
  PRICE_HINT,
  SUCCESS_RATE_HINT,
} from '../lib/column-hints'
import type { PricingModel } from '../types'

const model: PricingModel = {
  id: 1,
  model_name: 'kiln-seedance2.5-B1',
  description: '720P, 4-15s',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: ['default'],
}

function PricingTableHarness() {
  const columns = usePricingColumns()
  const { table } = useDataTable({
    data: [model],
    columns,
    pageCount: 1,
    manualPagination: true,
  })
  return <DataTableView table={table} applyHeaderSize />
}

describe('pricing column explanations', () => {
  // The header names the metric; how it is derived sits behind an info trigger
  // so the header stays narrow. Price carries its label in column meta only.
  it('explains how each measured column is derived', () => {
    render(<PricingTableHarness />)

    for (const hint of [AVERAGE_LATENCY_HINT, SUCCESS_RATE_HINT, PRICE_HINT]) {
      expect(screen.getByLabelText(hint)).toBeInTheDocument()
    }
  })
})
