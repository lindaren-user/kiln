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

import { docsOpenAIBaseUrl, resolveDocsSiteOrigin } from '../base-url'

describe('resolveDocsSiteOrigin', () => {
  test('uses the page host when ServerAddress is still the localhost default', () => {
    const siteOrigin = resolveDocsSiteOrigin({
      serverAddress: 'http://localhost:3000',
      pageOrigin: 'https://kiln.chat',
    })
    assert.equal(siteOrigin, 'https://kiln.chat')
    assert.equal(docsOpenAIBaseUrl(siteOrigin), 'https://kiln.chat/v1')
  })

  test('keeps a configured public ServerAddress', () => {
    assert.equal(
      resolveDocsSiteOrigin({
        serverAddress: 'https://api.kiln.chat/',
        pageOrigin: 'https://kiln.chat',
      }),
      'https://api.kiln.chat'
    )
  })

  test('keeps the local API address while developing on localhost', () => {
    assert.equal(
      resolveDocsSiteOrigin({
        serverAddress: 'http://localhost:3000/',
        pageOrigin: 'http://localhost:5173',
      }),
      'http://localhost:3000'
    )
  })

  test('falls back to the page origin when ServerAddress is empty', () => {
    assert.equal(
      resolveDocsSiteOrigin({
        serverAddress: '  ',
        pageOrigin: 'https://kiln.chat/',
      }),
      'https://kiln.chat'
    )
  })
})

describe('docsOpenAIBaseUrl', () => {
  test('appends /v1 once', () => {
    assert.equal(
      docsOpenAIBaseUrl('https://kiln.chat/v1/'),
      'https://kiln.chat/v1'
    )
    assert.equal(
      docsOpenAIBaseUrl('https://kiln.chat'),
      'https://kiln.chat/v1'
    )
  })
})
