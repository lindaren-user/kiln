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
import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import { resolvePublicOrigin } from '../public-origin'

describe('resolvePublicOrigin', () => {
  test('replaces the localhost default with the public page origin', () => {
    assert.equal(
      resolvePublicOrigin({
        serverAddress: 'http://localhost:3000/',
        pageOrigin: 'https://kiln.chat',
      }),
      'https://kiln.chat'
    )
    assert.equal(
      resolvePublicOrigin({
        serverAddress: 'http://127.0.0.1:3000',
        pageOrigin: 'https://kiln.chat',
      }),
      'https://kiln.chat'
    )
  })

  test('keeps a configured public ServerAddress', () => {
    assert.equal(
      resolvePublicOrigin({
        serverAddress: 'https://api.kiln.chat/',
        pageOrigin: 'https://kiln.chat',
      }),
      'https://api.kiln.chat'
    )
  })

  test('keeps loopback while both the API and the page stay local', () => {
    assert.equal(
      resolvePublicOrigin({
        serverAddress: 'http://localhost:3000',
        pageOrigin: 'http://localhost:5173',
      }),
      'http://localhost:3000'
    )
  })

  test('keeps the configured address when the page origin is unknown', () => {
    assert.equal(
      resolvePublicOrigin({
        serverAddress: 'http://localhost:3000',
        pageOrigin: '',
      }),
      'http://localhost:3000'
    )
  })

  test('falls back when neither address is available', () => {
    assert.equal(
      resolvePublicOrigin({
        pageOrigin: '   ',
        fallback: 'https://api.example.com',
      }),
      'https://api.example.com'
    )
  })
})
