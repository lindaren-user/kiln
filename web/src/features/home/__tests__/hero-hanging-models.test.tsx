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
import { render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { HeroHangingModels } from '../components/hero-hanging-models'

vi.mock('@/lib/lobe-icon', () => ({
  getLobeIcon: (name: string) => <span data-testid={`icon-${name}`} />,
}))

const i18n = createInstance()

beforeEach(async () => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  })
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)

  await i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: false,
    nsSeparator: false,
    resources: { en },
    interpolation: { escapeValue: false },
  })
})

describe('HeroHangingModels', () => {
  it('renders the hanging model tags with provider icons', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <HeroHangingModels />
      </I18nextProvider>
    )

    expect(
      screen.getByRole('group', { name: 'Supported models' })
    ).toBeInTheDocument()
    expect(screen.getByText('Seedance')).toBeInTheDocument()
    expect(screen.getByText('Kling')).toBeInTheDocument()
    expect(screen.getByText('MiniMax')).toBeInTheDocument()
    expect(screen.getByText('OpenAI')).toBeInTheDocument()
    expect(screen.getByText('Qwen')).toBeInTheDocument()
    expect(screen.getByText('Gemini')).toBeInTheDocument()
    expect(screen.getByTestId('icon-Doubao.Color')).toBeInTheDocument()
    expect(screen.getByTestId('icon-Kling.Color')).toBeInTheDocument()
    expect(screen.getByTestId('icon-Minimax.Color')).toBeInTheDocument()
    expect(screen.getByTestId('icon-OpenAI.Color')).toBeInTheDocument()
    expect(screen.getByTestId('icon-Qwen.Color')).toBeInTheDocument()
    expect(screen.getByTestId('icon-Gemini.Color')).toBeInTheDocument()
  })
})
