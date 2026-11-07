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
import { useQuery } from '@tanstack/react-query'
import type { PaginationState } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTablePagination,
  DataTableView,
  useDataTable,
} from '@/components/data-table'
import { getPerfMetricsSummary } from '@/features/performance-metrics/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import { DEFAULT_PRICING_PAGE_SIZE, DEFAULT_TOKEN_UNIT } from '../constants'
import type { PricingModel, TokenUnit } from '../types'
import { usePricingColumns, type PricingPerf } from './pricing-columns'

export interface PricingTableProps {
  models: PricingModel[]
  isLoading?: boolean
  priceRate?: number
  usdExchangeRate?: number
  tokenUnit?: TokenUnit
  showRechargePrice?: boolean
  selectedGroup?: string
  onModelClick?: (modelName: string) => void
}

export function PricingTable(props: PricingTableProps) {
  const { t } = useTranslation()
  const {
    models,
    isLoading = false,
    priceRate = 1,
    usdExchangeRate = 1,
    tokenUnit = DEFAULT_TOKEN_UNIT,
    showRechargePrice = false,
    selectedGroup,
    onModelClick,
  } = props

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PRICING_PAGE_SIZE,
  })
  const pageModelNames = useMemo(() => {
    const start = pagination.pageIndex * pagination.pageSize
    return models
      .slice(start, start + pagination.pageSize)
      .map((model) => model.model_name || '')
      .filter(Boolean)
  }, [models, pagination.pageIndex, pagination.pageSize])
  const perfQuery = useQuery({
    queryKey: ['perf-metrics-summary', 24, pageModelNames],
    queryFn: async () =>
      requireServerSuccess(await getPerfMetricsSummary(24, pageModelNames)),
    enabled: pageModelNames.length > 0,
    staleTime: 60 * 1000,
    retry: false,
  })
  const perfByModel = useMemo(() => {
    const map = new Map<string, PricingPerf>()
    for (const model of perfQuery.data?.data?.models ?? []) {
      map.set(model.model_name, {
        avg_latency_ms: model.avg_latency_ms,
        success_rate: model.success_rate,
      })
    }
    return map
  }, [perfQuery.data])

  const columns = usePricingColumns({
    tokenUnit,
    priceRate,
    usdExchangeRate,
    showRechargePrice,
    selectedGroup,
    onViewDetails: onModelClick,
    perfByModel,
  })

  const { table } = useDataTable({
    data: models,
    columns,
    pageCount: Math.ceil(models.length / pagination.pageSize),
    pagination,
    onPaginationChange: setPagination,
    manualPagination: false,
    withFilteredRowModel: false,
    withSortedRowModel: false,
    withFacetedRowModel: false,
  })

  return (
    <div className='space-y-4'>
      <DataTableView
        table={table}
        isLoading={isLoading}
        emptyTitle={t('No Models Found')}
        emptyDescription={t('No models match your current filters.')}
        skeletonKeyPrefix='pricing-skeleton'
        applyHeaderSize
        getColumnClassName={(columnId, kind) => {
          const header = kind === 'header' ? 'text-muted-foreground font-medium' : ''
          // Content-sized so leftover width stays with the description;
          // pr-8 keeps the action off the table edge.
          if (columnId === 'actions') {
            return [header, 'w-px whitespace-nowrap pr-8']
              .filter(Boolean)
              .join(' ')
          }
          return header
        }}
      />

      {!isLoading && models.length > 0 && <DataTablePagination table={table} />}
    </div>
  )
}
