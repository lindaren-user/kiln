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
import { AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { getServerErrorMessage } from '@/lib/server-error-message'

import type { ModelSyncInfo } from '../types'

type ModelSyncStatusProps = {
  status: 'idle' | 'loading' | 'success' | 'error' | 'stale'
  sync?: ModelSyncInfo
  error?: unknown
  /** Models the channel lists that the upstream no longer provides. */
  missing?: string[]
  /** Models the upstream provides that the channel does not list yet. */
  added?: string[]
}

/** The reason the check failed, or null when it did not. */
function syncFailure(
  status: ModelSyncStatusProps['status'],
  error: unknown,
  sync: ModelSyncInfo | undefined,
  unknownError: string
): string | null {
  if (status === 'error') return getServerErrorMessage(error, unknownError)
  if (sync?.supported && !sync.synced) return sync.message || unknownError
  return null
}

/**
 * One line under the model list saying where the list came from: this
 * channel's latest model list interface, or a hand-maintained list.
 */
export function ModelSyncStatus({
  status,
  sync,
  error,
  missing: missingModels,
  added: addedModels,
}: ModelSyncStatusProps) {
  const { t } = useTranslation()

  // Stale means the connection settings changed since the last check, so the
  // previous answer no longer describes this channel.
  if (status === 'idle' || status === 'stale') return null

  if (status === 'loading') {
    return (
      <p className='text-muted-foreground flex items-center gap-1.5 text-xs'>
        <Loader2
          className='size-3.5 shrink-0 animate-spin'
          aria-hidden='true'
        />
        {t("Checking the channel's latest model list...")}
      </p>
    )
  }

  const failure = syncFailure(status, error, sync, t('Unknown error') as string)
  if (failure) {
    return (
      <p className='flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400'>
        <AlertTriangle
          className='mt-0.5 size-3.5 shrink-0'
          aria-hidden='true'
        />
        {t('Model list sync failed: {{error}}', { error: failure })}
      </p>
    )
  }

  if (!sync) return null

  if (!sync.supported) {
    return (
      <p className='text-muted-foreground flex items-start gap-1.5 text-xs'>
        <Info className='mt-0.5 size-3.5 shrink-0' aria-hidden='true' />
        {t(
          'This channel provides no model list interface; its models are maintained manually.'
        )}
      </p>
    )
  }

  const hasMissing = (missingModels ?? []).length > 0
  const hasAdded = (addedModels ?? []).length > 0
  return (
    <div className='space-y-1 text-xs'>
      <p className='text-muted-foreground flex items-center gap-1.5'>
        <CheckCircle2 className='size-3.5 shrink-0' aria-hidden='true' />
        {t("Synced with this channel's latest model list.")}
      </p>
      {(hasMissing || hasAdded) && (
        <div className='text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1'>
          <span className='inline-flex items-center gap-1'>
            <span
              className='bg-muted size-3 rounded-sm ring-1 ring-black/10 ring-inset dark:ring-white/15'
              aria-hidden='true'
            />
            {t('Default: still provided by the upstream')}
          </span>
          {hasMissing && (
            <span className='text-destructive inline-flex items-center gap-1'>
              <span
                className='bg-destructive/15 size-3 rounded-sm'
                aria-hidden='true'
              />
              {t('Red: no longer provided by the upstream')}
            </span>
          )}
          {hasAdded && (
            <span className='inline-flex items-center gap-1 text-amber-700 dark:text-amber-400'>
              <span
                className='size-3 rounded-sm border border-dashed border-amber-500/60 bg-amber-500/15'
                aria-hidden='true'
              />
              {t('Yellow: newly provided upstream; click to add')}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
