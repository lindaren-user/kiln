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

import type { ReferenceKind } from '../lib/file-mention'

export type MediaKind = Exclude<ReferenceKind, 'file'>

type MediaLightboxProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  src: string
  alt: string
  /** A plain file has no preview, so only these kinds reach the dialog. */
  kind: MediaKind
  title?: string
  onDownload: () => void
}

const MEDIA_CLASS =
  'mx-auto max-h-[78vh] w-auto max-w-full rounded-lg object-contain'

/**
 * The media itself; recordings and clips get transport controls. Keyed by
 * source so the result lightbox, which stays mounted while the shown media
 * changes, remounts the element instead of reusing a player on the old file.
 */
function MediaPreview(props: { kind: MediaKind; src: string; alt: string }) {
  switch (props.kind) {
    case 'video':
      return (
        <video
          key={props.src}
          src={props.src}
          controls
          preload='metadata'
          playsInline
          aria-label={props.alt}
          className={MEDIA_CLASS}
        />
      )
    case 'audio':
      return (
        <audio
          key={props.src}
          src={props.src}
          controls
          preload='metadata'
          aria-label={props.alt}
          className='w-[min(88vw,28rem)]'
        />
      )
    case 'image':
      return (
        <img
          key={props.src}
          src={props.src}
          alt={props.alt}
          className={MEDIA_CLASS}
        />
      )
  }
}

/** Full-size view of one result or attached reference. */
export function MediaLightbox(props: MediaLightboxProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        // Without this the first tabbable child (Download) takes focus on open,
        // so a stray Enter/Space silently saved the file and skipped the warning.
        initialFocus={false}
        className='bg-background w-auto max-w-[92vw] gap-3 p-3 sm:max-w-[92vw]'
      >
        <DialogTitle className='sr-only'>
          {props.title ?? t('Generated image')}
        </DialogTitle>
        <DialogDescription className='sr-only'>{props.alt}</DialogDescription>
        <MediaPreview kind={props.kind} src={props.src} alt={props.alt} />
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
