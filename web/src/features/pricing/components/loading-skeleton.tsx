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
import { Skeleton } from '@/components/ui/skeleton'

export function LoadingSkeleton() {
  return (
    <div aria-busy='true'>
      <div className='mx-auto mb-5 flex max-w-3xl flex-col items-center pt-5 sm:mb-10 sm:pt-10'>
        <Skeleton className='h-[clamp(2.3rem,6.325vw,4.025rem)] w-48 max-w-full sm:w-64' />
        <Skeleton className='mt-3 h-5 w-56 max-w-full sm:mt-4 sm:h-6' />
        <Skeleton className='mt-2 h-5 w-full max-w-xl' />
        <Skeleton className='mt-4 h-10 w-full max-w-2xl sm:mt-6' />
      </div>
      <div className='grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]'>
        <div className='hidden self-start rounded-xl border p-3 xl:block'>
          <Skeleton className='mb-4 h-5 w-24' />
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className='flex flex-col gap-3 border-b py-4 last:border-0'
            >
              <Skeleton className='h-4 w-28' />
              <div className='flex flex-wrap gap-2'>
                <Skeleton className='h-7 w-24' />
                <Skeleton className='h-7 w-20' />
                <Skeleton className='h-7 w-28' />
              </div>
            </div>
          ))}
        </div>
        <div className='flex min-w-0 flex-col gap-4'>
          <div className='flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3'>
            <Skeleton className='h-7 w-20' />
            <div className='flex flex-wrap gap-2'>
              <Skeleton className='h-7 w-32' />
              <Skeleton className='h-7 w-20' />
              <Skeleton className='h-7 w-24' />
            </div>
          </div>
          <div className='overflow-hidden rounded-xl border'>
            {Array.from({ length: 10 }, (_, index) => (
              <div
                key={index}
                className='flex gap-4 border-b p-4 last:border-0'
              >
                <Skeleton className='h-5 w-40 max-w-full' />
                <Skeleton className='h-5 flex-1' />
                <Skeleton className='h-5 w-20' />
                <Skeleton className='h-5 w-28' />
                <Skeleton className='h-5 w-24' />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
