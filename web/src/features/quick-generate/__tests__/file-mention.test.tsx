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

import { PromptInput } from '@/components/ai-elements/prompt-input'

import { PromptMentionInput } from '../components/prompt-mention-input'
import {
  acceptedReferenceKinds,
  activeMentionQuery,
  filterMentionFiles,
  mentionMark,
  numberMentionTokens,
  referenceKind,
} from '../lib/file-mention'

describe('file mention query', () => {
  it('reads the @ query at the caret and ignores an earlier one', () => {
    expect(activeMentionQuery('draw @cat')).toBe('cat')
    expect(activeMentionQuery('@')).toBe('')
    expect(activeMentionQuery('email me@site then ')).toBeNull()
    expect(mentionMark('use @ca')).toBe(4)
  })

  it('filters uploaded files by the query', () => {
    const files = [
      { id: '1', filename: 'cat.png' },
      { id: '2', filename: 'dog.png' },
    ]
    expect(filterMentionFiles(files, 'do').map((file) => file.id)).toEqual([
      '2',
    ])
    expect(filterMentionFiles(files, '').map((file) => file.id)).toEqual([
      '1',
      '2',
    ])
  })
})

describe('mention numbering', () => {
  const label = (kind: string, index: number) => `${kind}${index}`

  it('numbers mentions by kind in attachment order', () => {
    const files = [
      { filename: 'cat.png' },
      { filename: 'voice.mp3' },
      { filename: 'dog.png' },
    ]

    expect(
      numberMentionTokens(
        '@cat.png then @voice.mp3 and @dog.png',
        files,
        'Image',
        label
      )
    ).toBe('image1 then audio1 and image2')
  })

  it('keeps one number for a file mentioned twice', () => {
    expect(
      numberMentionTokens(
        '@cat.png meets @cat.png',
        [{ filename: 'cat.png' }],
        'Image',
        label
      )
    ).toBe('image1 meets image1')
  })

  it('leaves an unknown mention and a longer token alone', () => {
    expect(
      numberMentionTokens(
        '@cat.pngx mail@cat.png @other.png',
        [{ filename: 'cat.png' }],
        'Image',
        label
      )
    ).toBe('@cat.pngx mail@cat.png @other.png')
  })

  it('uses the fallback name for a file without one', () => {
    // A file whose type is unknown is numbered with the plain-file label.
    expect(
      numberMentionTokens('@Image holds', [{}], 'Image', label)
    ).toBe('file1 holds')
  })
})

describe('reference kind', () => {
  it('trusts the extension when the browser reports the wrong type', () => {
    // Windows browsers report audio files as images on some machines; the
    // extension keeps an audio reference out of the image preview and request.
    expect(referenceKind({ filename: 'clip.mp3', mediaType: 'image/png' })).toBe(
      'audio'
    )
    expect(referenceKind({ filename: 'clip.MOV', mediaType: '' })).toBe(
      'video'
    )
    expect(referenceKind({ filename: 'still.png', mediaType: '' })).toBe(
      'image'
    )
    expect(referenceKind({ filename: 'notes.txt', mediaType: '' })).toBe('file')
  })

  it('maps accept rules to the kinds a model takes', () => {
    expect([...acceptedReferenceKinds('image/*')]).toEqual(['image'])
    expect([...acceptedReferenceKinds('video/*,audio/*')]).toEqual([
      'video',
      'audio',
    ])
    expect([...acceptedReferenceKinds('')]).toEqual([])
  })
})

function MentionHarness(props: { controlled?: boolean }) {
  const [value, setValue] = useState('')
  return (
    <PromptInput onSubmit={() => undefined}>
      <PromptMentionInput
        value={props.controlled ? value : ''}
        onChange={props.controlled ? setValue : vi.fn()}
        placeholder='Describe what you want to create'
        label='Prompt'
      />
    </PromptInput>
  )
}

function renderEditor(controlled = false) {
  render(<MentionHarness controlled={controlled} />)
}

describe('mentioning an uploaded file', () => {
  it('brings the placeholder back after the text is deleted', () => {
    renderEditor(true)
    const editor = screen.getByRole('textbox', { name: 'Prompt' })
    editor.textContent = 'a kiln'
    fireEvent.input(editor)

    expect(screen.queryByText('Describe what you want to create')).toBeNull()

    // Browsers leave a break in an emptied contenteditable.
    editor.replaceChildren(document.createElement('br'))
    fireEvent.input(editor)

    expect(
      screen.getByText('Describe what you want to create')
    ).toBeInTheDocument()
  })

  it('lists uploaded files after @ and inserts a chip', () => {
    renderEditor()
    const file = new File(['x'], 'cat.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Upload files'), {
      target: { files: [file] },
    })

    const editor = screen.getByRole('textbox', { name: 'Prompt' })
    editor.textContent = 'draw @ca'
    fireEvent.input(editor)

    fireEvent.click(screen.getByRole('option', { name: 'cat.png' }))

    const chip = editor.querySelector('[data-mention-id]')
    expect(chip).toHaveAttribute('aria-label', 'cat.png')
    expect(chip).toHaveTextContent('cat.png')
    expect(editor.textContent).not.toContain('@ca')
    expect(
      editor
        .closest('form')
        ?.querySelector<HTMLInputElement>('input[name="message"]')?.value
    ).toContain('@cat.png')
  })

  it('keeps the arrow-key highlight on the matching file', () => {
    renderEditor()
    const input = screen.getByLabelText('Upload files')
    fireEvent.change(input, {
      target: {
        files: [
          new File(['a'], 'cat.png', { type: 'image/png' }),
          new File(['b'], 'dog.png', { type: 'image/png' }),
        ],
      },
    })

    const editor = screen.getByRole('textbox', { name: 'Prompt' })
    editor.textContent = '@'
    fireEvent.input(editor)
    fireEvent.keyDown(editor, { key: 'ArrowDown' })
    fireEvent.keyUp(editor, { key: 'ArrowDown' })

    expect(screen.getByRole('option', { name: 'dog.png' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('option', { name: 'cat.png' })).toHaveAttribute(
      'aria-selected',
      'false'
    )
  })

  it('shows an uploaded file at the top of the prompt, truncated, and previews it on click', () => {
    renderEditor()
    const name = `${'wechat-file-'.repeat(8)}.png`
    fireEvent.change(screen.getByLabelText('Upload files'), {
      target: { files: [new File(['x'], name, { type: 'image/png' })] },
    })

    const editor = screen.getByRole('textbox', { name: 'Prompt' })
    const chip = screen.getByTitle(name)
    expect(chip).toHaveClass('max-w-48')
    expect(chip.querySelector('.truncate')).toHaveTextContent(name)
    expect(
      editor.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_PRECEDING
    ).toBeTruthy()
    expect(editor.parentElement).toHaveClass('w-full')
    expect(screen.getByText('Describe what you want to create')).toHaveClass(
      'line-clamp-2',
      'left-3',
      'right-3'
    )

    fireEvent.click(screen.getByRole('button', { name }))
    expect(screen.getByRole('img', { name })).toBeInTheDocument()
  })

  it('turns a stored mention back into a chip when its file returns', () => {
    // A reload restores the draft text first and the files afterwards, so the
    // mention is plain text for a moment.
    render(
      <PromptInput onSubmit={() => undefined}>
        <PromptMentionInput
          value='@cat.png draw a kiln'
          onChange={vi.fn()}
          placeholder='Describe what you want to create'
          label='Prompt'
        />
      </PromptInput>
    )
    const editor = screen.getByRole('textbox', { name: 'Prompt' })
    expect(editor.textContent).toContain('@cat.png')

    fireEvent.change(screen.getByLabelText('Upload files'), {
      target: { files: [new File(['x'], 'cat.png', { type: 'image/png' })] },
    })

    const chip = editor.querySelector('[data-mention-id]')
    expect(chip).toHaveAttribute('aria-label', 'cat.png')
    expect(editor).toHaveTextContent('draw a kiln')
    expect(editor.textContent).not.toContain('@cat.png')
    expect(
      editor
        .closest('form')
        ?.querySelector<HTMLInputElement>('input[name="message"]')?.value
    ).toBe('@cat.png draw a kiln')
  })

  it('says to upload a file when @ has nothing to list', () => {
    renderEditor()
    const editor = screen.getByRole('textbox', { name: 'Prompt' })
    editor.textContent = '@'
    fireEvent.input(editor)

    expect(screen.getByText('Upload a file to mention it')).toBeInTheDocument()
    expect(screen.queryByRole('option')).toBeNull()
  })
})
