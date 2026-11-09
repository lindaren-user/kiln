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
import { ViewIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import {
  formatLatencyClock,
  formatUptimePct,
  getSuccessRateTextClass,
} from '@/features/performance-metrics/lib/format'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import type { PricingModel } from '../types'
import { ModelPriceCell, type ModelPriceCellOptions } from './model-price-cell'

export type PricingPerf = {
  avg_latency_ms: number
  success_rate: number
}

export type PricingColumnsOptions = ModelPriceCellOptions & {
  onViewDetails?: (modelName: string) => void
  perfByModel?: ReadonlyMap<string, PricingPerf>
}

export function usePricingColumns(
  options: PricingColumnsOptions = {}
): ColumnDef<PricingModel>[] {
  const { t } = useTranslation()

  return [
    {
      accessorKey: 'model_name',
      header: t('Model'),
      enableSorting: false,
      cell: ({ row }) => {
        const model = row.original
        const modelIconKey = model.icon || model.vendor_icon
        const modelIcon = modelIconKey ? getLobeIcon(modelIconKey, 14) : null

        return (
          <div className='flex max-w-full min-w-0 items-center gap-2'>
            {modelIcon}
            <span className='truncate font-mono text-sm font-medium'>
              {model.model_name}
            </span>
          </div>
        )
      },
      minSize: 180,
      size: 240,
    },

    {
      id: 'avg_latency',
      header: t('Average latency'),
      cell: ({ row }) => {
        const perf = options.perfByModel?.get(row.original.model_name)
        return (
          <span className='font-mono text-sm tabular-nums'>
            {formatLatencyClock(perf?.avg_latency_ms ?? Number.NaN)}
          </span>
        )
      },
      size: 120,
      enableSorting: false,
    },

    {
      id: 'success_rate',
      header: t('Success rate'),
      cell: ({ row }) => {
        const rate =
          options.perfByModel?.get(row.original.model_name)?.success_rate ??
          Number.NaN
        return (
          <span
            className={cn(
              'font-mono text-sm tabular-nums',
              getSuccessRateTextClass(rate)
            )}
          >
            {formatUptimePct(rate)}
          </span>
        )
      },
      size: 110,
      enableSorting: false,
    },

    {
      accessorKey: 'price',
      meta: { label: t('Price') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Price')} />
      ),
      cell: ({ row }) => (
        <ModelPriceCell model={row.original} options={options} />
      ),
      size: 180,
      enableSorting: false,
    },

    {
      accessorKey: 'description',
      meta: { label: t('Description') },
      header: t('Description'),
      cell: ({ row }) => {
        const description = row.original.description?.trim()
        if (!description) {
          return (
            <span className='text-muted-foreground/60 text-sm'>
              {t('No description available.')}
            </span>
          )
        }
        // Same treatment as the card this table replaced, plus an explicit
        // wrap: table cells are nowrap by default, and one unbreakable line
        // widens the table and squeezes the price column until its amounts
        // break mid-number.
        return (
          <span
            className='text-muted-foreground line-clamp-2 text-[13px] leading-5 break-words whitespace-normal'
            title={description}
          >
            {description}
          </span>
        )
      },
      minSize: 280,
      size: 420,
      enableSorting: false,
    },

    {
      id: 'actions',
      header: t('Actions'),
      cell: ({ row }) => (
        <button
          type='button'
          className='text-foreground inline-flex items-center gap-1 text-xs font-medium hover:underline'
          onClick={() => options.onViewDetails?.(row.original.model_name)}
        >
          <HugeiconsIcon
            icon={ViewIcon}
            className='size-3'
            strokeWidth={2}
            aria-hidden='true'
          />
          {t('View details')}
        </button>
      ),
      size: 120,
      enableSorting: false,
      enableHiding: false,
    },
  ]
}
