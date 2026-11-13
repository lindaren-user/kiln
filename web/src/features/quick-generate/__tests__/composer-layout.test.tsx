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
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { GenerateComposer } from '../components/generate-composer'
import { capabilityFor, defaultValues } from '../lib/capabilities'

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
