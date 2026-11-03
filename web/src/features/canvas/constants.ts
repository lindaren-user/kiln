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
import { DEFAULT_IMAGE_SIZE } from '@/features/image-generation/constants'

import type { PromptNodeData } from './types'

export const CANVAS_STORAGE_KEY = 'kiln:canvas:v1'

export const PROMPT_NODE_WIDTH = 320

export const DEFAULT_PROMPT_DATA: PromptNodeData = {
  model: '',
  prompt: '',
  size: DEFAULT_IMAGE_SIZE,
  count: 1,
  status: 'idle',
}
