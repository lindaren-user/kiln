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
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'

type ImageLightboxProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  src: string
  alt: string
  onDownload: () => void
}

/** Full-size view of one result. The image scales to the viewport, never past it. */
export function ImageLightbox(props: ImageLightboxProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        // Without this the first tabbable child (Download) takes focus on open,
        // so a stray Enter/Space silently saved the file and skipped the warning.
        initialFocus={false}
        className='bg-background w-auto max-w-[92vw] gap-3 p-3 sm:max-w-[92vw]'
      >
        <DialogTitle className='sr-only'>{t('Generated image')}</DialogTitle>
        <DialogDescription className='sr-only'>{props.alt}</DialogDescription>
        <img
          src={props.src}
          alt={props.alt}
          className='mx-auto max-h-[78vh] w-auto max-w-full rounded-lg object-contain'
        />
        <div className='flex justify-center'>
          <Button variant='outline' size='sm' onClick={props.onDownload}>
            <Download className='mr-2 size-4' aria-hidden='true' />
            {t('Download')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
