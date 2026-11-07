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
import { describe, expect, it, vi } from 'vitest'

import type { ApiKey } from '@/features/keys/types'

import { GenerateComposer } from '../components/generate-composer'
import { capabilityFor, defaultValues } from '../lib/capabilities'

const API_KEY: ApiKey = {
  id: 7,
  name: 'Quick key',
  key: 'abc**********xyz',
  status: 1,
  remain_quota: 0,
  used_quota: 0,
  unlimited_quota: true,
  expired_time: -1,
  created_time: 0,
  accessed_time: 0,
  group: '',
  auto_groups: null,
  cross_group_retry: false,
  model_limits_enabled: false,
  model_limits: '',
  allow_ips: '',
  allow_user_quota_query: false,
}

function renderComposer() {
  const capability = capabilityFor('z-image', 'image')
  render(
    <GenerateComposer
      modelItems={[{ value: 'z-image', label: 'z-image' }]}
      model='z-image'
      promptPlaceholder='Describe what you want to create'
      onModelChange={vi.fn()}
      capability={capability}
      values={defaultValues(capability)}
      onValueChange={vi.fn()}
      keys={[API_KEY]}
      selectedKeyId={API_KEY.id}
      onKeyChange={vi.fn()}
      onSubmit={() => true}
      busy={false}
      disabled={false}
    />
  )
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
      screen.getByLabelText('API key'),
    ]

    const tools = commonAncestor(controls)

    expect(tools).toHaveClass('flex-wrap')
    for (const control of controls) {
      expect(tools).toContainElement(control)
    }
  })

  it('keeps the prompt when the model changes', () => {
    const first = capabilityFor('z-image', 'image')
    const view = render(
      <GenerateComposer
        modelItems={[{ value: 'z-image', label: 'z-image' }]}
        model='z-image'
        promptPlaceholder='Describe what you want to create'
        onModelChange={vi.fn()}
        capability={first}
        values={defaultValues(first)}
        onValueChange={vi.fn()}
        keys={[API_KEY]}
        selectedKeyId={API_KEY.id}
        onKeyChange={vi.fn()}
        onSubmit={() => true}
        busy={false}
        disabled={false}
      />
    )
    const editor = screen.getByRole('textbox', { name: 'Prompt' })
    editor.textContent = 'keep this prompt'
    fireEvent.input(editor)

    const next = capabilityFor('sora-2', 'video')
    view.rerender(
      <GenerateComposer
        modelItems={[{ value: 'sora-2', label: 'sora-2' }]}
        model='sora-2'
        promptPlaceholder='Describe what you want to create'
        onModelChange={vi.fn()}
        capability={next}
        values={defaultValues(next)}
        onValueChange={vi.fn()}
        keys={[API_KEY]}
        selectedKeyId={API_KEY.id}
        onKeyChange={vi.fn()}
        onSubmit={() => true}
        busy={false}
        disabled={false}
      />
    )

    expect(screen.getByRole('textbox', { name: 'Prompt' })).toHaveTextContent(
      'keep this prompt'
    )
  })

  it('puts the model and the key first', () => {
    renderComposer()
    const model = screen.getByLabelText('Model')
    const key = screen.getByLabelText('API key')
    const ratio = screen.getByLabelText('Aspect Ratio')
    // Throws unless the three share the wrapping row.
    commonAncestor([model, key, ratio])

    expect(
      model.compareDocumentPosition(key) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      key.compareDocumentPosition(ratio) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('keeps the send button outside the row, at the bottom-right', () => {
    renderComposer()
    const tools = commonAncestor([
      screen.getByLabelText('Aspect Ratio'),
      screen.getByLabelText('API key'),
    ])
    const submit = screen.getByRole('button', { name: 'Generate' })

    expect(tools).not.toContainElement(submit)
    expect(
      tools.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(submit).toHaveClass('self-end')
    expect(tools.parentElement).toHaveClass('items-end')
  })
})
