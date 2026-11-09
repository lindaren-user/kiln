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
import type { PricingModel } from '../types'

const model: PricingModel = {
  id: 1,
  model_name: 'kiln-seedance2.5-B1',
  description:
    '720P，4-15秒，9图/3视频/3音频，比例：16:9、9:16、1:1。参考图片宽高均需大于300px。',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: ['default'],
}

function PricingTableHarness(props: { models: PricingModel[] }) {
  const columns = usePricingColumns()
  const { table } = useDataTable({
    data: props.models,
    columns,
    pageCount: 1,
    manualPagination: true,
  })
  return <DataTableView table={table} applyHeaderSize />
}

describe('pricing description column', () => {
  // Table cells are nowrap by default: a description that inherits it becomes
  // one unbreakable line, which widens the table past its container and
  // squeezes the price column until its amounts break mid-number.
  it('lets a long description wrap inside its own cell', () => {
    render(<PricingTableHarness models={[model]} />)

    const description = screen.getByText(model.description as string)
    expect(description).toHaveClass('whitespace-normal')
    expect(description).toHaveClass('line-clamp-2')
  })

  it('shows the placeholder when a model has no description', () => {
    render(<PricingTableHarness models={[{ ...model, description: '  ' }]} />)

    expect(screen.getByText('No description available.')).toBeVisible()
  })
})
