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
import { Download, RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from '@/components/ui/progress'
import { cn } from '@/lib/utils'

import { progressPercent } from '../lib/poll-video'
import type { Generation } from '../types'

type ResultPanelProps = {
  generation: Generation | null
  /** Price of the generation the composer will send. Empty when unknown. */
  runPrice?: string
  onZoom: (index: number) => void
  onDownload: (index: number) => void
  onRetry: () => void
  /** Offered only for a finished 480p sample the vendor still holds. */
  onUpgradeDraft?: () => void
}

/** The wording a provider sends while it has no percentage to report. */
function ProgressStatus(props: { text?: string }) {
  if (!props.text) return null
  return (
    <span className='text-muted-foreground ml-auto text-sm'>{props.text}</span>
  )
}

/**
 * `Generating...` followed by the time the request has been running. Every
 * request shows the clock; only a polled video task wraps it in a bar. The
 * run's start time is stored with it, so rejoining a task after a reload
 * resumes the clock instead of starting again at 0:00.
 */
function GeneratingText(props: { startedAt: number }) {
  const { t } = useTranslation()
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const seconds = Math.max(0, Math.floor((now - props.startedAt) / 1000))
  const minutes = Math.floor(seconds / 60)
  const remainder = String(seconds % 60).padStart(2, '0')
  return `${t('Generating...')} ${minutes}:${remainder}`
}

/**
 * A polled video task: a progress bar with the elapsed time. The bar is
 * determinate from the start, sitting at 0% until the first poll reports a
 * percentage, so the readout is never blank and never guessed.
 */
function RunningStatus(props: { progress?: string; startedAt: number }) {
  const { t } = useTranslation()
  // The poller only reports percentages that go up, so the bar never shrinks
  // between polls. Before the first percentage it holds at 0 rather than an
  // indeterminate bar, which readers cannot tell apart from a stalled task.
  const percent = progressPercent(props.progress)

  return (
    <Progress
      value={percent ?? 0}
      aria-label={t('Generating...')}
      className='w-full max-w-xs px-6'
    >
      <ProgressLabel className='text-muted-foreground font-normal'>
        <GeneratingText startedAt={props.startedAt} />
      </ProgressLabel>
      {/* A provider that reports a status word instead of a percentage keeps
          showing what it said, beside the 0% the bar starts from. */}
      {percent === null ? <ProgressStatus text={props.progress} /> : null}
      <ProgressValue />
    </Progress>
  )
}

/**
 * One fixed frame that holds every result, whatever its aspect ratio or count.
 * The frame fills the space the page gives it, so media never pushes the page
 * into a scroll. Cells split it evenly; each image is contained, not cropped.
 */
export function ResultPanel(props: ResultPanelProps) {
  const { t } = useTranslation()
  const generation = props.generation
  const media = generation?.media ?? []
  const images = media.filter((item) => item.type === 'image')
  const video = media.find((item) => item.type === 'video')
  const count = images.length

  return (
    <div className='bg-muted/20 border-border/70 relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-xl border'>
      {!generation && (
        <div className='text-muted-foreground flex max-w-xs flex-col items-center gap-2 px-6 text-center'>
          {/* The frame holds images or a video, so the empty state stays
              media-neutral instead of promising one of them. */}
          <Sparkles className='size-8 opacity-60' aria-hidden='true' />
          <p className='text-sm font-medium'>{t('Your result appears here')}</p>
          <p className='text-xs leading-5'>
            {t('Describe what you want, pick a model, then generate.')}
          </p>
          <p className='text-xs leading-5'>
            {t('Estimated cost')}
            {props.runPrice ? (
              <span className='text-warning ml-1 font-semibold tabular-nums'>
                {props.runPrice}
              </span>
            ) : null}
          </p>
        </div>
      )}

      {/* An image comes back in one response with nothing to measure, so only
          a video task, which the console polls, gets a progress bar. */}
      {generation?.status === 'running' &&
        (generation.kind === 'video' ? (
          <RunningStatus
            progress={generation.progress}
            startedAt={generation.startedAt}
          />
        ) : (
          <p className='text-muted-foreground text-sm'>
            <GeneratingText startedAt={generation.startedAt} />
          </p>
        ))}

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

      {video && (
        <div className='group/cell relative size-full p-2'>
          <video
            src={video.url}
            controls
            playsInline
            aria-label={generation?.prompt ?? ''}
            className='size-full rounded-lg object-contain'
          />
          <Button
            type='button'
            size='icon-sm'
            variant='secondary'
            onClick={() => props.onDownload(0)}
            aria-label={t('Download')}
            className='absolute top-3 right-3 opacity-0 transition-opacity group-hover/cell:opacity-100 focus-visible:opacity-100'
          >
            <Download className='size-3.5' aria-hidden='true' />
          </Button>
          {/* A 480p sample can be turned into a 1080p final for seven days. */}
          {props.onUpgradeDraft && (
            <Button
              type='button'
              size='sm'
              variant='secondary'
              onClick={props.onUpgradeDraft}
              className='absolute top-3 left-3'
            >
              <Sparkles className='mr-2 size-4' aria-hidden='true' />
              {t('Upgrade to 1080p')}
            </Button>
          )}
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
              key={`${generation?.id}-${image.url.slice(-32)}`}
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
                  src={image.url}
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
