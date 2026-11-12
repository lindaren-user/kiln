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
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { MultiSelect } from '../multi-select'

test('chips flagged as invalid are drawn in the destructive tone', () => {
  render(
    <MultiSelect
      options={[]}
      selected={['live-model', 'retired-model']}
      invalidValues={['Retired-Model']}
      onChange={vi.fn()}
    />
  )

  expect(
    screen.getByText('retired-model').closest('[data-slot="combobox-chip"]')
  ).toHaveClass('text-destructive')
  expect(
    screen.getByText('live-model').closest('[data-slot="combobox-chip"]')
  ).not.toHaveClass('text-destructive')
})

test('upstream models the channel lacks copy on click and join the list from the plus button', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  const writeText = vi.spyOn(navigator.clipboard, 'writeText')
  render(
    <MultiSelect
      options={[]}
      selected={['live-model']}
      addedValues={['new-model']}
      onChange={onChange}
    />
  )

  const name = screen.getByRole('button', { name: 'new-model' })
  expect(name.closest('span')).toHaveClass('text-amber-700')

  await user.click(name)
  expect(writeText).toHaveBeenCalledWith('new-model')
  expect(onChange).not.toHaveBeenCalled()

  await user.click(
    screen.getByRole('button', { name: 'Add this model to the list' })
  )
  expect(onChange).toHaveBeenCalledWith(['live-model', 'new-model'])
})
