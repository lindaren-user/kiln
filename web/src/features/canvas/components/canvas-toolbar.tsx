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
import { Link } from '@tanstack/react-router'
import { KeyRound, Plus, Trash2 } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ApiKey } from '@/features/keys/types'

type CanvasToolbarProps = {
  keys: ApiKey[]
  selectedKeyId: number | null
  onKeyChange: (id: number) => void
  onAddPrompt: () => void
  onClear: () => void
  canClear: boolean
}

export const CanvasToolbar = memo(function CanvasToolbar(
  props: CanvasToolbarProps
) {
  const { t } = useTranslation()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const keyItems = useMemo(
    () =>
      props.keys.map((key) => ({
        value: String(key.id),
        label: key.name,
      })),
    [props.keys]
  )

  return (
    <div className='flex flex-wrap items-center gap-2 p-1'>
      <Button size='sm' onClick={props.onAddPrompt}>
        <Plus aria-hidden='true' />
        {t('New prompt')}
      </Button>

      {props.keys.length > 0 ? (
        <Select
          items={keyItems}
          value={props.selectedKeyId ? String(props.selectedKeyId) : null}
          onValueChange={(value) => props.onKeyChange(Number(value))}
        >
          <SelectTrigger className='w-44' size='sm' aria-label={t('API key')}>
            <KeyRound aria-hidden='true' />
            <SelectValue placeholder={t('Select an API key')} />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {keyItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Button size='sm' variant='outline' render={<Link to='/keys' />}>
          <KeyRound aria-hidden='true' />
          {t('Create an API key')}
        </Button>
      )}

      <Button
        size='icon-sm'
        variant='ghost'
        aria-label={t('Clear canvas')}
        title={t('Clear canvas')}
        disabled={!props.canClear}
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 aria-hidden='true' />
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('Clear canvas')}
        desc={t('This removes every node from the canvas. Continue?')}
        confirmText={t('Clear')}
        destructive
        handleConfirm={() => {
          props.onClear()
          setConfirmOpen(false)
        }}
      />
    </div>
  )
})
