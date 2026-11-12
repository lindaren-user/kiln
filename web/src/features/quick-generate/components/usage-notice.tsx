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
import { ChevronDown, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

import { readStoredJson, writeStoredJson } from '../lib/stored-json'

const COLLAPSED_STORAGE_KEY = 'kiln:quick-generate:notice-collapsed:v1'

/**
 * The testing caveats above the result panel. Collapsing keeps the first line
 * in view, and the choice survives a reload because it is how the page is used
 * rather than a one-off decision.
 */
export function UsageNotice() {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(
    () => readStoredJson(COLLAPSED_STORAGE_KEY) === true
  )

  return (
    <Collapsible
      open={!collapsed}
      onOpenChange={(open) => {
        setCollapsed(!open)
        writeStoredJson(COLLAPSED_STORAGE_KEY, !open)
      }}
      className='border-border/70 bg-muted/30 shrink-0 rounded-lg border'
    >
      <CollapsibleTrigger className='text-foreground flex w-full items-start gap-2 px-3 py-2 text-left text-xs leading-5'>
        <TriangleAlert
          className='text-warning mt-0.5 size-4 shrink-0'
          aria-hidden='true'
        />
        <span className='min-w-0 flex-1 font-medium'>
          {t('For testing only. Using this as a workbench is not recommended.')}
        </span>
        <ChevronDown
          className={cn(
            'mt-0.5 size-4 shrink-0 transition-transform',
            !collapsed && 'rotate-180'
          )}
          aria-hidden='true'
        />
      </CollapsibleTrigger>
      {/* The repo-wide keyframes slide the panel's height. Without them the
          result area below reflows in one frame, which reads as a jolt. */}
      <CollapsibleContent className='CollapsibleContent'>
        <ul className='list-disc space-y-1 pr-3 pb-2 pl-9 text-xs leading-5'>
          <li>
            {t(
              'Results are not saved: an image still generating is lost when you leave or reload this page, and a finished video must be downloaded as soon as it is ready.'
            )}
          </li>
          <li>
            {t(
              'A video task keeps running while you are away: leave or reload this page and it is picked up again.'
            )}
          </li>
          <li>
            {t(
              'If the video will not play here, open it from Task log → Artifacts.'
            )}
          </li>
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
