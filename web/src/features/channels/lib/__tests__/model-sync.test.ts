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
import { expect, test } from 'vitest'

import { compareChannelModels } from '../model-sync'

test('models the upstream still lists are not reported, ignoring case', () => {
  expect(
    compareChannelModels(
      ['SD-特价', 'sd2.5-z'],
      ['sd-特价', 'SD2.5-Z', 'brand-new']
    )
  ).toEqual({ missing: [], added: ['brand-new'] })
})

test('models only the channel lists are reported in channel order', () => {
  expect(
    compareChannelModels(
      ['retired-a', 'live', 'retired-b'],
      ['live', 'brand-new']
    )
  ).toEqual({ missing: ['retired-a', 'retired-b'], added: ['brand-new'] })
})

test('a model redirected to a listed upstream name counts as served', () => {
  const mapping = JSON.stringify({
    'v6k-seedanco2-5-720-2': 'V-稳定seedanco2.5-720【主打】',
    'junk-model': ['V-missing', 'V-稳定seedanco2.5-720【主打】'],
  })
  expect(
    compareChannelModels(
      ['v6k-seedanco2-5-720-2', 'junk-model', 'dropped-model'],
      ['V-稳定seedanco2.5-720【主打】'],
      mapping
    )
  ).toEqual({ missing: ['dropped-model'], added: [] })
})

test('an unparsable draft mapping does not vouch for anything', () => {
  expect(compareChannelModels(['old-model'], [], '{not json')).toEqual({
    missing: ['old-model'],
    added: [],
  })
})

test('upstream names the channel does not list yet are reported in upstream order', () => {
  expect(
    compareChannelModels(
      ['SD-特价', 'sd2.5-z'],
      ['brand-new', 'sd-特价', 'another-new', 'SD2.5-Z']
    )
  ).toEqual({ missing: [], added: ['brand-new', 'another-new'] })
})

test('an upstream name already reached through a redirect is not new', () => {
  const mapping = JSON.stringify({
    'v6k-seedanco2-5-720-2': 'V-稳定seedanco2.5-720【主打】',
  })
  expect(
    compareChannelModels(
      ['v6k-seedanco2-5-720-2'],
      ['V-稳定seedanco2.5-720【主打】', 'V-全新模型'],
      mapping
    )
  ).toEqual({ missing: [], added: ['V-全新模型'] })
})

test('a redirect from a model the channel no longer lists does not hide a new name', () => {
  const mapping = JSON.stringify({ 'gone-model': 'V-新模型' })
  expect(compareChannelModels(['other-model'], ['V-新模型'], mapping)).toEqual({
    missing: ['other-model'],
    added: ['V-新模型'],
  })
})
