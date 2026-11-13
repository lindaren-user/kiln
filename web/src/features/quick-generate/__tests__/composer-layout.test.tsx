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
import { act, fireEvent, render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import zh from '@/i18n/locales/zh.json'

import { GenerateComposer } from '../components/generate-composer'
import { capabilityFor, defaultValues } from '../lib/capabilities'
import type { GenerationValues } from '../types'

const imageSchema = {
  fields: [
    {
      key: 'ratio',
      labelKey: 'Aspect Ratio',
      type: 'select' as const,
      defaultValue: '1:1',
      options: [{ value: '1:1', label: '1:1' }],
      requestPath: ['size'],
    },
    {
      key: 'count',
      labelKey: 'Count',
      type: 'select' as const,
      defaultValue: '1',
      options: [{ value: '1', label: '1' }],
      requestPath: ['n'],
    },
  ],
}

/** The page owns the prompt; the harness stands in for it. */
function Composer(props: {
  model: string
  capability: ReturnType<typeof capabilityFor>
  prompt?: string
}) {
  const [prompt, setPrompt] = useState(props.prompt ?? '')
  return (
    <GenerateComposer
      modelItems={[{ value: props.model, label: props.model }]}
      model={props.model}
      promptPlaceholder='Describe what you want to create'
      onModelChange={vi.fn()}
      capability={props.capability}
      prompt={prompt}
      onPromptChange={setPrompt}
      values={defaultValues(props.capability)}
      onValueChange={vi.fn()}
      onSubmit={() => true}
      busy={false}
      disabled={false}
    />
  )
}

function renderComposer(prompt?: string) {
  const capability = capabilityFor('image', imageSchema)
  render(<Composer model='z-image' capability={capability} prompt={prompt} />)
}

function commonAncestor(elements: HTMLElement[]): HTMLElement {
  let candidate: HTMLElement | null = elements[0] ?? null
  while (candidate) {
    const current: HTMLElement = candidate
    if (elements.every((element) => current.contains(element))) return current
    candidate = current.parentElement
  }
  throw new Error('the controls do not share a container')
}

describe('composer footer layout', () => {
  it('keeps every parameter in one wrapping row', () => {
    renderComposer()
    const controls = [
      screen.getByLabelText('Aspect Ratio'),
      screen.getByLabelText('Count'),
      screen.getByLabelText('Model'),
    ]

    const tools = commonAncestor(controls)

    expect(tools).toHaveClass('flex-wrap')
    for (const control of controls) {
      expect(tools).toContainElement(control)
    }
  })

  it('keeps the prompt when the model changes', () => {
    const first = capabilityFor('image', imageSchema)
    const view = render(<Composer model='z-image' capability={first} />)
    const editor = screen.getByRole('textbox', { name: 'Prompt' })
    editor.textContent = 'keep this prompt'
    fireEvent.input(editor)

    const next = capabilityFor('video', { fields: [] })
    view.rerender(<Composer model='sora-2' capability={next} />)

    expect(screen.getByRole('textbox', { name: 'Prompt' })).toHaveTextContent(
      'keep this prompt'
    )
  })

  it('puts the model before its parameters', () => {
    renderComposer()
    const model = screen.getByLabelText('Model')
    const ratio = screen.getByLabelText('Aspect Ratio')
    // Throws unless the two share the wrapping row.
    commonAncestor([model, ratio])

    expect(
      model.compareDocumentPosition(ratio) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('keeps the send button outside the row, at the bottom-right', () => {
    renderComposer()
    const tools = commonAncestor([
      screen.getByLabelText('Model'),
      screen.getByLabelText('Aspect Ratio'),
    ])
    const submit = screen.getByRole('button', { name: 'Generate' })

    expect(tools).not.toContainElement(submit)
    expect(
      tools.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(submit.parentElement).toHaveClass('ml-auto', 'items-center')
    expect(tools.parentElement).toHaveClass('items-end')
  })
})

describe('prompt character counter', () => {
  it('shows how much of the 6000 character limit the prompt uses', () => {
    renderComposer('hello')

    expect(screen.getByText('5 / 6,000')).toBeInTheDocument()
  })

  it('keeps generating available at the limit', () => {
    renderComposer('x'.repeat(6000))

    expect(screen.getByText('6,000 / 6,000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled()
  })

  it('blocks generating past the limit', () => {
    renderComposer('x'.repeat(6001))

    expect(screen.getByText('6,001 / 6,000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
  })
})

const draftSchema = {
  fields: [
    {
      key: 'resolution',
      labelKey: 'Resolution',
      type: 'select' as const,
      defaultValue: '1080p',
      options: ['480p', '720p', '1080p'].map((value) => ({
        value,
        label: value,
      })),
      requestPath: ['metadata', 'resolution'],
    },
    {
      key: 'draft',
      labelKey: '480p sample',
      type: 'select' as const,
      defaultValue: 'false',
      options: [
        { value: 'false', label: 'Off' },
        { value: 'true', label: 'On' },
      ],
      requestPath: ['metadata', 'draft'],
    },
    {
      key: 'image_mode',
      labelKey: 'Image mode',
      type: 'select' as const,
      defaultValue: 'reference',
      options: [
        { value: 'reference', label: 'Reference' },
        { value: 'first_frame', label: 'First frame' },
        { value: 'first_last', label: 'First & last' },
      ],
      requestPath: ['metadata', 'image_mode'],
    },
    {
      key: 'ratio',
      labelKey: 'Aspect Ratio',
      type: 'select' as const,
      defaultValue: '16:9',
      options: [
        { value: '16:9', label: '16:9' },
        { value: '9:16', label: '9:16' },
        { value: 'adaptive', label: 'Adaptive' },
      ],
      requestPath: ['metadata', 'ratio'],
    },
  ],
}

function draftComposer(values: GenerationValues) {
  return (
    <GenerateComposer
      modelItems={[{ value: 'seedance', label: 'seedance' }]}
      model='seedance'
      promptPlaceholder='Describe what you want to create'
      onModelChange={vi.fn()}
      capability={capabilityFor('video', draftSchema)}
      prompt=''
      onPromptChange={vi.fn()}
      values={values}
      onValueChange={vi.fn()}
      onSubmit={() => true}
      busy={false}
      disabled={false}
    />
  )
}

describe('sample draft controls', () => {
  afterEach(async () => {
    await act(() => i18next.changeLanguage('en'))
  })

  it('hides the resolution control while the 480p sample is on', () => {
    const view = render(
      draftComposer({ resolution: '1080p', draft: 'true' })
    )

    expect(screen.queryByLabelText('Resolution')).not.toBeInTheDocument()
    expect(screen.getByLabelText('480p sample')).toBeInTheDocument()

    view.rerender(draftComposer({ resolution: '1080p', draft: 'false' }))

    expect(screen.getByLabelText('Resolution')).toBeInTheDocument()
  })

  it('hides the ratio control while a frame fixes the aspect ratio', () => {
    const view = render(
      draftComposer({ image_mode: 'first_last', ratio: '16:9' })
    )

    expect(screen.queryByLabelText('Aspect Ratio')).not.toBeInTheDocument()

    view.rerender(draftComposer({ image_mode: 'reference', ratio: '16:9' }))

    expect(screen.getByLabelText('Aspect Ratio')).toBeInTheDocument()
  })

  it('translates plugin option labels with the interface language', async () => {
    i18next.addResourceBundle('zh', 'translation', zh.translation, true, true)
    await act(() => i18next.changeLanguage('zh'))

    render(draftComposer({ resolution: '1080p', draft: 'true' }))

    expect(screen.getByText('开启')).toBeInTheDocument()
  })
})
