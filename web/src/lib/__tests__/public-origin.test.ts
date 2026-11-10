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
import { describe, expect, it } from 'vitest'

import { resolvePublicOrigin } from '../public-origin'

describe('resolvePublicOrigin', () => {
  it('uses the server address an administrator configured', () => {
    expect(
      resolvePublicOrigin('https://api.kiln.example', 'https://kiln.example')
    ).toBe('https://api.kiln.example')
  })

  it('replaces the unconfigured loopback default with the page origin', () => {
    expect(
      resolvePublicOrigin('http://localhost:3000', 'https://kiln.example')
    ).toBe('https://kiln.example')
  })

  it('keeps a loopback server address when the page is loopback too', () => {
    expect(
      resolvePublicOrigin('http://127.0.0.1:3000', 'http://localhost:3000')
    ).toBe('http://127.0.0.1:3000')
  })

  it('falls back to the page origin when the server address is absent', () => {
    expect(resolvePublicOrigin(undefined, 'https://kiln.example')).toBe(
      'https://kiln.example'
    )
    expect(resolvePublicOrigin('', 'https://kiln.example')).toBe(
      'https://kiln.example'
    )
  })

  it('strips a trailing slash and ignores non-string values', () => {
    expect(
      resolvePublicOrigin('https://api.kiln.example/', 'https://kiln.example')
    ).toBe('https://api.kiln.example')
    expect(resolvePublicOrigin(42, 'https://kiln.example/')).toBe(
      'https://kiln.example'
    )
  })

  it('keeps a usable placeholder when no origin is available', () => {
    expect(resolvePublicOrigin(undefined, '')).toBe('https://api.example.com')
  })
})
