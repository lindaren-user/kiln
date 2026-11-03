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
import { Download, ImageIcon, Loader2, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { Generation } from '../types'

type ResultPanelProps = {
  generation: Generation | null
  onZoom: (index: number) => void
  onDownload: (index: number) => void
  onRetry: () => void
}

/**
 * One fixed frame that holds every result, whatever its aspect ratio or count.
 * The frame fills the space the page gives it, so images never push the page
 * into a scroll. Cells split it evenly; each image is contained, not cropped.
 */
export function ResultPanel(props: ResultPanelProps) {
  const { t } = useTranslation()
  const generation = props.generation
  const images = generation?.images ?? []
  const count = images.length

  return (
    <div className='bg-muted/20 border-border/70 relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-xl border'>
      {!generation && (
        <div className='text-muted-foreground flex max-w-xs flex-col items-center gap-2 px-6 text-center'>
          <ImageIcon className='size-8 opacity-60' aria-hidden='true' />
          <p className='text-sm font-medium'>{t('Your result appears here')}</p>
          <p className='text-xs leading-5'>
            {t('Describe what you want, pick a model, then generate.')}
          </p>
        </div>
      )}

      {generation?.status === 'running' && (
        <div className='text-muted-foreground flex flex-col items-center gap-3'>
          <Loader2 className='size-6 animate-spin' aria-hidden='true' />
          <p className='text-sm'>{t('Generating')}</p>
        </div>
      )}

      {generation?.error && (
        <div className='flex flex-col items-center gap-3 px-6 text-center'>
          <p className='text-destructive text-sm' role='alert'>
            {generation.error}
          </p>
          <Button variant='outline' size='sm' onClick={props.onRetry}>
            <RotateCcw className='mr-2 size-4' aria-hidden='true' />
            {t('Retry')}
          </Button>
        </div>
      )}

      {count > 0 && (
        <div
          className={cn(
            'grid size-full gap-2 p-2',
            count === 1 && 'grid-cols-1 grid-rows-1',
            count === 2 && 'grid-cols-2 grid-rows-1',
            count >= 3 && 'grid-cols-2 grid-rows-2'
          )}
        >
          {/* Data URLs share a long prefix, so cells key on the tail — a base64
              image is far too big to use as a key. */}
          {images.map((image, index) => (
            <div
              key={`${generation?.id}-${image.slice(-32)}`}
              className={cn(
                'bg-muted/40 group/cell relative min-h-0 min-w-0 overflow-hidden rounded-lg',
                count === 3 && index === 2 && 'col-span-2'
              )}
            >
              <button
                type='button'
                onClick={() => props.onZoom(index)}
                aria-label={t('View full size')}
                className='size-full cursor-zoom-in'
              >
                <img
                  src={image}
                  alt={generation?.prompt ?? ''}
                  className='size-full object-contain'
                />
              </button>
              <Button
                type='button'
                size='icon-sm'
                variant='secondary'
                onClick={() => props.onDownload(index)}
                aria-label={t('Download')}
                className='absolute right-1.5 bottom-1.5 opacity-0 transition-opacity group-hover/cell:opacity-100 focus-visible:opacity-100'
              >
                <Download className='size-3.5' aria-hidden='true' />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
