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
import { t } from 'i18next'

import {
  listEnabledApiKeys,
  resolveApiKey,
} from '@/features/image-generation/api'
import { createApiKey } from '@/features/keys/api'
import { ERROR_MESSAGES } from '@/features/keys/constants'
import {
  API_KEY_FORM_DEFAULT_VALUES,
  transformFormDataToPayload,
} from '@/features/keys/lib'
import type { ApiKeyFormData } from '@/features/keys/types'
import { createServerError } from '@/lib/server-error-message'

/**
 * The name of the key this page creates for itself. A quick-generate user
 * never picks or sees a key: the first run creates this one and later runs
 * reuse it, the same way Infinite Canvas obtains its own token.
 */
const QUICK_GENERATE_KEY_NAME = '快速生成'

/**
 * The console's own key defaults, so a change to them keeps applying here.
 * They are unlimited, so the token's own quota never blocks a run; spending
 * still counts against the account.
 */
const QUICK_GENERATE_KEY_FORM: ApiKeyFormData = transformFormDataToPayload({
  ...API_KEY_FORM_DEFAULT_VALUES,
  name: QUICK_GENERATE_KEY_NAME,
})

async function findQuickGenerateKey() {
  const keys = await listEnabledApiKeys()
  return keys.find((key) => key.name === QUICK_GENERATE_KEY_NAME) ?? null
}

async function ensureQuickGenerateKeyId(): Promise<number> {
  const existing = await findQuickGenerateKey()
  if (existing) return existing.id

  const created = await createApiKey(QUICK_GENERATE_KEY_FORM)
  if (!created.success) {
    throw createServerError(created, t(ERROR_MESSAGES.CREATE_FAILED))
  }
  const token = await findQuickGenerateKey()
  if (!token) throw new Error(t(ERROR_MESSAGES.CREATE_FAILED))
  return token.id
}

/**
 * The key id and the `sk-...` credential a generation needs. Callers keep the
 * id with an unfinished video task and never store the credential itself.
 */
export async function resolveQuickGenerateKey(): Promise<{
  id: number
  apiKey: string
}> {
  const id = await ensureQuickGenerateKeyId()
  return { id, apiKey: await resolveApiKey(id) }
}
