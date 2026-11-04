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
import { useEffect, useRef, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

const SWING = 1
const DAMPING = 1.1
const PUSH = 1
const BOUNCE = 0.3
const SVG_NS = 'http://www.w3.org/2000/svg'
const THREAD_CLASS = 'stroke-muted-foreground/45 fill-none'

const MODELS = [
  { id: 'seedance', label: 'Seedance', icon: 'Doubao.Color' },
  { id: 'kling', label: 'Kling', icon: 'Kling.Color' },
  { id: 'minimax', label: 'MiniMax', icon: 'Minimax.Color' },
  { id: 'openai', label: 'OpenAI', icon: 'OpenAI.Color' },
  { id: 'qwen', label: 'Qwen', icon: 'Qwen.Color' },
  { id: 'gemini', label: 'Gemini', icon: 'Gemini.Color' },
] as const

const LENS = [1, 1.12, 0.94, 1.08, 0.98, 1.05]

const TAG_FACE_SHADOW: CSSProperties = {
  boxShadow:
    'calc(var(--sx, 0) * 1px) calc(4px + var(--sy, 0) * 1px) calc(10px + var(--sb, 0) * 1px) rgba(40, 30, 20, 0.08), calc(var(--sx, 0) * 0.3px) 1px 2px rgba(40, 30, 20, 0.06)',
}

type TagState = {
  el: HTMLElement
  path: SVGPathElement
  knot: SVGPathElement
  w: number
  h: number
  ax: number
  Lt: number
  L: number
  Lv: number
  th: number
  om: number
}

interface HeroHangingModelsProps {
  className?: string
}

function createStrokePath(parent: SVGGElement): SVGPathElement {
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('class', THREAD_CLASS)
  path.setAttribute('stroke-width', '1')
  path.setAttribute('stroke-linecap', 'round')
  parent.appendChild(path)
  return path
}

export function HeroHangingModels(props: HeroHangingModelsProps) {
  const { t } = useTranslation()
  const stageRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<SVGLineElement>(null)
  const knotsRef = useRef<SVGGElement>(null)
  const pathsRef = useRef<SVGGElement>(null)
  const tagsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stage = stageRef.current
    const rail = railRef.current
    const knotsG = knotsRef.current
    const pathsG = pathsRef.current
    const tagsRoot = tagsRef.current
    if (!stage || !rail || !knotsG || !pathsG || !tagsRoot) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const tagEls = [
      ...tagsRoot.querySelectorAll<HTMLElement>('[data-hanging-tag]'),
    ]
    if (tagEls.length === 0) return

    const tags: TagState[] = tagEls.map((el) => ({
      el,
      path: createStrokePath(pathsG),
      knot: createStrokePath(knotsG),
      w: 0,
      h: 0,
      ax: 0,
      Lt: 0,
      L: 0,
      Lv: 0,
      th: 0,
      om: 0,
    }))

    let railY = 0
    let gravity = 0
    let raf = 0
    let lastTs = 0
    const ptr = {
      x: -999,
      y: -999,
      vx: 0,
      vy: 0,
      lx: -999,
      ly: -999,
      on: false,
    }

    const endOf = (tag: TagState) => ({
      x: tag.ax + tag.L * Math.sin(tag.th),
      y: railY + tag.L * Math.cos(tag.th),
    })

    const layout = () => {
      const width = stage.clientWidth
      const height = stage.clientHeight
      for (const tag of tags) {
        tag.w = tag.el.offsetWidth
        tag.h = tag.el.offsetHeight
      }
      const gap = 8
      const total =
        tags.reduce((sum, tag) => sum + tag.w, 0) + gap * (tags.length - 1)
      let x = Math.max(4, (width - total) / 2)
      railY = Math.round(Math.max(height * 0.1, 12))
      const base = Math.min(Math.max(height * 0.5, 72), 110)
      tags.forEach((tag, i) => {
        tag.ax = x + tag.w / 2
        x += tag.w + gap
        tag.Lt = base * LENS[i % LENS.length]
        tag.L = tag.Lt
        tag.Lv = 0
        tag.knot.setAttribute('d', `M${tag.ax - 3.5} ${railY} q3.5 5 7 0`)
      })
      const pad = 18
      rail.setAttribute('x1', String((width - total) / 2 - pad))
      rail.setAttribute('x2', String((width + total) / 2 + pad))
      rail.setAttribute('y1', String(railY))
      rail.setAttribute('y2', String(railY))
      gravity = 3300 * SWING * SWING * (base / 100)
    }

    const draw = () => {
      for (const tag of tags) {
        const end = endOf(tag)
        const deg = (-tag.th * 0.88 * 180) / Math.PI
        tag.el.style.transform = `translate(${(end.x - tag.w / 2).toFixed(2)}px, ${(end.y + 3).toFixed(2)}px) rotate(${deg.toFixed(3)}deg)`
        tag.el.style.setProperty('--sx', (-Math.sin(tag.th) * 7).toFixed(2))
        tag.el.style.setProperty(
          '--sy',
          Math.min(8, Math.abs(tag.L - tag.Lt) * 0.12).toFixed(2)
        )
        tag.el.style.setProperty(
          '--sb',
          Math.min(10, Math.abs(tag.om) * 2.4).toFixed(2)
        )

        const mx = (tag.ax + end.x) / 2
        const my = (railY + end.y) / 2
        const sag =
          tag.L < tag.Lt - 1
            ? Math.sqrt(Math.max(0, tag.Lt * tag.Lt - tag.L * tag.L)) * 0.45
            : 0
        const bend = Math.max(-12, Math.min(12, -tag.om * tag.L * 0.03)) + sag
        const qx = mx + Math.cos(tag.th) * bend
        const qy = my - Math.sin(tag.th) * bend
        tag.path.setAttribute(
          'd',
          `M${tag.ax.toFixed(2)} ${railY} Q${qx.toFixed(2)} ${qy.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
        )
      }
    }

    const step = (dt: number) => {
      const pushK = Math.min(1, PUSH * 14 * dt)
      for (const tag of tags) {
        const reach = tag.L + tag.h * 0.5
        const accel =
          -(gravity / reach) * Math.sin(tag.th) - DAMPING * 1.6 * tag.om
        if (ptr.on && PUSH > 0) {
          const end = endOf(tag)
          const cx = end.x + Math.sin(tag.th) * tag.h * 0.5
          const cy = end.y + Math.cos(tag.th) * tag.h * 0.5
          if (
            Math.abs(ptr.x - cx) < tag.w / 2 + 8 &&
            Math.abs(ptr.y - cy) < tag.h / 2 + 10
          ) {
            const vt = ptr.vx * Math.cos(tag.th) - ptr.vy * Math.sin(tag.th)
            const want = Math.max(-7, Math.min(7, vt / reach))
            tag.om += (want - tag.om) * pushK
          }
        }
        tag.om += accel * dt
        tag.th += tag.om * dt
        if (tag.th > 1.25) {
          tag.th = 1.25
          tag.om *= -0.3
        } else if (tag.th < -1.25) {
          tag.th = -1.25
          tag.om *= -0.3
        }
        const spring = 420 * SWING
        const damp = 2 * Math.sqrt(spring) * (1 - Math.min(0.85, BOUNCE))
        tag.Lv += (-spring * (tag.L - tag.Lt) - damp * tag.Lv) * dt
        tag.L += tag.Lv * dt
      }

      for (let i = 0; i < tags.length - 1; i++) {
        const left = tags[i]
        const right = tags[i + 1]
        const leftEnd = endOf(left)
        const rightEnd = endOf(right)
        if (Math.abs(leftEnd.y - rightEnd.y) > (left.h + right.h) * 0.5) {
          continue
        }
        const overlap =
          leftEnd.x + left.w / 2 - (rightEnd.x - right.w / 2) + 1
        if (overlap <= 0) continue

        const leftCos = Math.max(0.3, Math.cos(left.th))
        const rightCos = Math.max(0.3, Math.cos(right.th))
        const leftSpeed = left.om * left.L * leftCos
        const rightSpeed = right.om * right.L * rightCos
        if (leftSpeed > rightSpeed) {
          const bounce = 0.35
          const nextLeft =
            ((1 - bounce) * leftSpeed + (1 + bounce) * rightSpeed) / 2
          const nextRight =
            ((1 + bounce) * leftSpeed + (1 - bounce) * rightSpeed) / 2
          left.om = nextLeft / (left.L * leftCos)
          right.om = nextRight / (right.L * rightCos)
        }
        left.th -= (overlap * 0.5) / left.L
        right.th += (overlap * 0.5) / right.L
      }
    }

    const pointerTo = (x: number, y: number, dt: number) => {
      if (ptr.lx > -999 && dt > 0) {
        const blend = Math.min(1, dt * 30)
        ptr.vx += ((x - ptr.lx) / dt - ptr.vx) * blend
        ptr.vy += ((y - ptr.ly) / dt - ptr.vy) * blend
      }
      ptr.x = x
      ptr.y = y
      ptr.lx = x
      ptr.ly = y
      ptr.on = true
    }

    let lastPointerTs = 0
    const onPointerMove = (event: PointerEvent) => {
      const rect = stage.getBoundingClientRect()
      const now = event.timeStamp / 1000
      pointerTo(
        event.clientX - rect.left,
        event.clientY - rect.top,
        lastPointerTs ? Math.max(0.004, now - lastPointerTs) : 0
      )
      lastPointerTs = now
    }
    const onPointerLeave = () => {
      ptr.on = false
      ptr.lx = -999
    }

    const tick = (ts: number) => {
      const dt = lastTs ? Math.min((ts - lastTs) / 1000, 1 / 20) : 1 / 60
      lastTs = ts
      if (!reduced) {
        for (let s = 0; s < 4; s++) step(dt / 4)
        ptr.vx *= Math.exp(-dt * 9)
        ptr.vy *= Math.exp(-dt * 9)
      }
      draw()
      raf = requestAnimationFrame(tick)
    }

    layout()
    if (!reduced) {
      tags.forEach((tag, i) => {
        tag.th = (i % 2 ? -1 : 1) * 0.12
        tag.L = tag.Lt * 0.92
      })
    }
    draw()
    raf = requestAnimationFrame(tick)

    stage.addEventListener('pointermove', onPointerMove)
    stage.addEventListener('pointerleave', onPointerLeave)
    const resizeObserver = new ResizeObserver(() => {
      layout()
      draw()
    })
    resizeObserver.observe(stage)

    return () => {
      cancelAnimationFrame(raf)
      stage.removeEventListener('pointermove', onPointerMove)
      stage.removeEventListener('pointerleave', onPointerLeave)
      resizeObserver.disconnect()
      knotsG.replaceChildren()
      pathsG.replaceChildren()
    }
  }, [])

  return (
    <div
      ref={stageRef}
      className={cn(
        'relative h-[180px] w-full max-w-xl touch-none select-none overflow-hidden',
        props.className
      )}
      role='group'
      aria-label={t('Supported models')}
      data-hanging-models
    >
      <svg
        className='pointer-events-none absolute inset-0 size-full overflow-visible'
        aria-hidden='true'
      >
        <line
          ref={railRef}
          className='stroke-muted-foreground/50'
          strokeWidth='1'
          strokeLinecap='round'
        />
        <g ref={knotsRef} />
        <g ref={pathsRef} />
      </svg>

      <div ref={tagsRef} className='pointer-events-none absolute inset-0'>
        {MODELS.map((model) => (
          <div
            key={model.id}
            data-hanging-tag={model.id}
            className='pointer-events-none absolute top-0 left-0 origin-[50%_0] will-change-transform'
          >
            <span
              aria-hidden='true'
              className='absolute top-[-5px] left-1/2 h-2 w-1 -ml-0.5 rounded-[1.5px] bg-gradient-to-r from-stone-400 via-stone-200 to-stone-400 shadow-xs dark:from-stone-500 dark:via-stone-400 dark:to-stone-600'
            />
            <span
              className='border-border/70 bg-background/95 text-foreground inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium whitespace-nowrap backdrop-blur-sm'
              style={TAG_FACE_SHADOW}
            >
              <span className='inline-flex size-3.5 shrink-0 items-center justify-center'>
                {getLobeIcon(model.icon, 14)}
              </span>
              <span>{model.label}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
