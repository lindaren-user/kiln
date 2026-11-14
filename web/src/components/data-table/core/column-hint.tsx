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
import { Info } from 'lucide-react'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type ColumnHintProps = {
  /** Header label, already translated. */
  title: React.ReactNode
  /** How the column is derived; shown on hover and on keyboard focus. */
  hint: string
}

export function ColumnHint(props: ColumnHintProps) {
  return (
    <span className='inline-flex items-center gap-1'>
      {props.title}
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              tabIndex={0}
              aria-label={props.hint}
              className='text-muted-foreground/60 hover:text-foreground focus-visible:text-foreground focus-visible:ring-ring/50 inline-flex cursor-help items-center rounded-xs focus-visible:ring-2 focus-visible:outline-none'
            />
          }
        >
          <Info className='size-3.5' aria-hidden='true' />
        </TooltipTrigger>
        <TooltipContent className='max-w-72 leading-relaxed text-pretty'>
          {props.hint}
        </TooltipContent>
      </Tooltip>
    </span>
  )
}
