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

import { buildImageSize } from '../constants'

describe('buildImageSize', () => {
  it('keeps a square ratio square', () => {
    expect(buildImageSize('1:1', '1k')).toBe('1024x1024')
    expect(buildImageSize('1:1', '2k')).toBe('2048x2048')
    expect(buildImageSize('1:1', '4k')).toBe('4096x4096')
  })

  it('collapses every landscape ratio onto 3:2', () => {
    for (const ratio of ['3:2', '4:3', '16:9', '21:9']) {
      expect(buildImageSize(ratio, '1k')).toBe('1536x1024')
    }
  })

  it('collapses every portrait ratio onto 2:3', () => {
    for (const ratio of ['2:3', '3:4', '9:16', '9:21']) {
      expect(buildImageSize(ratio, '1k')).toBe('1024x1536')
    }
  })

  it('scales the collapse with the resolution', () => {
    expect(buildImageSize('16:9', '2k')).toBe('3072x2048')
    expect(buildImageSize('9:16', '2k')).toBe('2048x3072')
  })

  it('passes auto straight through', () => {
    expect(buildImageSize('auto', '1k')).toBe('auto')
  })
})
