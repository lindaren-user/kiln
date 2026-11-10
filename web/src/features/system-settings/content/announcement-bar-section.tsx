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
import { Save } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import { SettingsSwitchField } from '../components/settings-form-layout'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const ENABLED_KEY = 'console_setting.announcement_bar_enabled'
const TEXT_KEY = 'console_setting.announcement_bar_text'

type AnnouncementBarSectionProps = {
  enabled: boolean
  text: string
}

/** The scrolling bar pinned under the console header. */
export function AnnouncementBarSection(props: AnnouncementBarSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  // A draft overrides the saved text until it is saved, so a refetch of the
  // settings still shows through when nothing is being edited.
  const [draftText, setDraftText] = useState<string | null>(null)
  const text = draftText ?? props.text

  const handleToggle = async (checked: boolean) => {
    await updateOption
      .mutateAsync({ key: ENABLED_KEY, value: checked })
      .catch(() => {
        // The shared update hook already reports the failure.
      })
  }

  const handleSave = async () => {
    try {
      await updateOption.mutateAsync({ key: TEXT_KEY, value: text.trim() })
      setDraftText(null)
    } catch {
      // The shared update hook already reports the failure.
    }
  }

  return (
    <SettingsSection title={t('Announcement Bar')}>
      <div className='space-y-4'>
        <SettingsSwitchField
          checked={props.enabled}
          onCheckedChange={handleToggle}
          label={t('Enabled')}
          description={t(
            'Show a continuously scrolling bar under the console header. The text below must not be empty.'
          )}
        />
        <div className='space-y-2'>
          <Label htmlFor='announcement-bar-text'>
            {t('Announcement bar text')}
          </Label>
          <Textarea
            id='announcement-bar-text'
            rows={3}
            maxLength={500}
            value={text}
            onChange={(event) => setDraftText(event.target.value)}
            placeholder={t('Enter the text shown in the scrolling bar')}
            aria-describedby='announcement-bar-text-hint'
          />
          <p
            id='announcement-bar-text-hint'
            className='text-muted-foreground text-xs'
          >
            {t(
              'Plain text only. The bar scrolls continuously and pauses on hover.'
            )}
          </p>
        </div>
        <Button
          size='sm'
          variant='secondary'
          disabled={updateOption.isPending || text.trim() === props.text}
          onClick={handleSave}
        >
          <Save className='mr-2 h-4 w-4' />
          {updateOption.isPending ? t('Saving...') : t('Save Settings')}
        </Button>
      </div>
    </SettingsSection>
  )
}
