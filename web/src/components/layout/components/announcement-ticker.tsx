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
import { Megaphone, Pause, Play } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Constant reading speed, so a longer text takes longer instead of rushing. */
const MARQUEE_SPEED_PX_PER_SECOND = 60

type AnnouncementTickerProps = {
  text: string
  className?: string
}

/**
 * The administrator-configured announcement bar: one line that scrolls
 * continuously, whatever the text length. Short texts repeat until one half of
 * the loop covers the viewport, so the loop stays seamless. Copies after the
 * first are hidden from assistive technology and never focusable.
 */
export function AnnouncementTicker(props: AnnouncementTickerProps) {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const viewportRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [copies, setCopies] = useState(1)
  const [duration, setDuration] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    // The static branch below uses neither the loop count nor the duration.
    if (reducedMotion) return
    const viewport = viewportRef.current
    const measure = measureRef.current
    if (!viewport || !measure) return
    const update = () => {
      const itemWidth = measure.scrollWidth
      if (itemWidth <= 0) return
      // Each half of the track must cover the viewport for a seamless loop.
      const perHalf = Math.max(1, Math.ceil(viewport.clientWidth / itemWidth))
      setCopies(perHalf)
      setDuration(
        Math.max((itemWidth * perHalf) / MARQUEE_SPEED_PX_PER_SECOND, 1)
      )
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    // Fonts and the viewport width change the geometry; measure again then.
    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    observer.observe(measure)
    return () => observer.disconnect()
  }, [props.text, reducedMotion])

  if (!props.text) return null
  const animate = !reducedMotion

  return (
    <div
      role='region'
      aria-label={t('Announcements')}
      className={cn(
        'border-sky-200/80 bg-sky-50 text-sky-950 flex h-[var(--announcement-bar-height,2rem)] items-center gap-1 border-b px-2 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-100',
        props.className
      )}
    >
      <Megaphone
        aria-hidden='true'
        className='text-sky-700 dark:text-sky-300 size-3.5 shrink-0'
      />
      <div
        ref={viewportRef}
        className={cn(
          'relative min-w-0 flex-1',
          animate ? 'overflow-hidden' : 'overflow-x-auto'
        )}
      >
        {animate ? (
          <>
            {/* Offscreen copy of one item: the loop length and speed come from it. */}
            <div
              ref={measureRef}
              aria-hidden='true'
              className='invisible absolute w-max px-6 text-sm whitespace-nowrap'
            >
              {props.text}
            </div>
            <div
              className='announcement-ticker-track animate-marquee flex w-max text-sm whitespace-nowrap'
              style={{
                animationDuration: duration > 0 ? `${duration}s` : undefined,
                animationPlayState: paused ? 'paused' : undefined,
              }}
            >
              {Array.from({ length: copies * 2 }, (_, index) => (
                <span
                  key={index}
                  className='px-6'
                  aria-hidden={index > 0 ? true : undefined}
                >
                  {props.text}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className='w-max px-6 text-sm whitespace-nowrap'>{props.text}</p>
        )}
      </div>
      {animate ? (
        <Button
          type='button'
          variant='ghost'
          size='icon-xs'
          className='text-sky-800 hover:text-sky-950 hover:bg-sky-900/10 dark:text-sky-200 dark:hover:bg-white/10 dark:hover:text-white size-5 shrink-0'
          aria-label={
            paused ? t('Resume announcements') : t('Pause announcements')
          }
          aria-pressed={paused}
          onClick={() => setPaused((current) => !current)}
        >
          {paused ? <Play aria-hidden='true' /> : <Pause aria-hidden='true' />}
        </Button>
      ) : null}
    </div>
  )
}
