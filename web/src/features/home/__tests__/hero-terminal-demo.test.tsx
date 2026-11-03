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
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeEach, describe, expect, it } from 'vitest'

import en from '@/i18n/locales/en.json'

import { HeroTerminalDemo } from '../components/hero-terminal-demo'

const i18n = createInstance()

beforeEach(async () => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  })
  await i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: false,
    nsSeparator: false,
    resources: { en },
    interpolation: { escapeValue: false },
  })
})

function renderDemo() {
  return render(
    <I18nextProvider i18n={i18n}>
      <HeroTerminalDemo />
    </I18nextProvider>
  )
}

describe('HeroTerminalDemo', () => {
  it('shows an image generation call instead of a chat completion', () => {
    renderDemo()

    expect(screen.getByRole('button', { name: 'Image' })).toBeInTheDocument()
    expect(screen.getByText('/v1/images/generations')).toBeInTheDocument()
    expect(screen.getAllByText('POST')).toHaveLength(2)
    expect(screen.queryByText('/v1/chat/completions')).toBeNull()
    expect(screen.queryByText('/v1/messages')).toBeNull()
    expect(document.body.textContent).not.toContain('generateContent')
  })

  it('switches the sample to the video generation call', async () => {
    renderDemo()

    fireEvent.click(screen.getByRole('button', { name: 'Video' }))

    expect(
      await screen.findByText('/v1/video/generations')
    ).toBeInTheDocument()
    expect(screen.getAllByText('POST')).toHaveLength(2)
    expect(document.body.textContent).toContain('"duration": 5')
    expect(screen.queryByText('/v1/images/generations')).toBeNull()
  })

  it('switches the sample to a video task poll without a request body', async () => {
    renderDemo()

    fireEvent.click(screen.getByRole('button', { name: 'Task' }))

    expect(
      await screen.findByText('/v1/video/generations/{task_id}')
    ).toBeInTheDocument()
    expect(screen.getAllByText('GET')).toHaveLength(2)
    expect(document.body.textContent).not.toContain('"duration"')
    expect(document.body.textContent).toContain('SUCCESS')
  })
})
