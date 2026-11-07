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
import { Download, TriangleAlert } from 'lucide-react'
import { nanoid } from 'nanoid'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { generateImages, resolveApiKey } from '@/features/image-generation/api'
import {
  buildImageSize,
  DEFAULT_IMAGE_RATIO,
  DEFAULT_IMAGE_RESOLUTION,
  type ImageResolution,
} from '@/features/image-generation/constants'
import { useImageApiKeys } from '@/features/image-generation/hooks/use-image-api-keys'
import { useImageModels } from '@/features/image-generation/hooks/use-image-models'
import { FormNavigationGuard } from '@/features/system-settings/components/form-navigation-guard'

import { GenerateComposer } from './components/generate-composer'
import { ImageLightbox } from './components/image-lightbox'
import { ResultPanel } from './components/result-panel'
import { downloadImage, imageFilename } from './lib/download-image'
import type { Generation, GenerationParams } from './types'

/**
 * Single-result image checks. Each generation replaces the last one, nothing is
 * persisted, and an undownloaded result warns before the page unloads.
 */
export function QuickGenerate() {
  const { t } = useTranslation()
  const {
    models,
    items: modelItems,
    isLoading: modelsLoading,
  } = useImageModels()
  const {
    keys,
    selectedKeyId,
    selectKey,
    isLoading: keysLoading,
  } = useImageApiKeys()

  // TODO: list the recent generations under the result. The page already
  // tracks every run by id, so the list should read that state instead of
  // adding a second request path.
  const [generation, setGeneration] = useState<Generation | null>(null)
  const [preferredModel, setPreferredModel] = useState('')
  const [ratio, setRatio] = useState(DEFAULT_IMAGE_RATIO)
  const [resolution, setResolution] = useState<ImageResolution>(
    DEFAULT_IMAGE_RESOLUTION
  )
  const [count, setCount] = useState(1)
  // `zoomIndex` outlives the open state so the closing animation never renders
  // an empty image, which used to look like a second dialog flashing open.
  const [zoomIndex, setZoomIndex] = useState<number | null>(null)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)

  // A remembered model that is gone falls back to the first available one.
  const model = models.includes(preferredModel)
    ? preferredModel
    : (models[0] ?? '')
  const busy = generation?.status === 'running'
  const noModels = !modelsLoading && models.length === 0

  const runGeneration = useCallback(
    async (params: GenerationParams, prompt: string) => {
      if (!params.model || selectedKeyId === null) return

      const id = nanoid()
      setZoomIndex(null)
      setZoomOpen(false)
      setGeneration({
        ...params,
        id,
        prompt,
        status: 'running',
        images: [],
        saved: false,
      })

      try {
        const apiKey = await resolveApiKey(selectedKeyId)
        const images = await generateImages({
          apiKey,
          model: params.model,
          prompt,
          size: buildImageSize(params.ratio, params.resolution),
          count: params.count,
        })
        setGeneration((current) =>
          current?.id === id ? { ...current, status: 'done', images } : current
        )
      } catch (error) {
        setGeneration((current) =>
          current?.id === id
            ? {
                ...current,
                status: 'error',
                error:
                  error instanceof Error
                    ? error.message
                    : t('Image generation failed'),
              }
            : current
        )
      }
    },
    [selectedKeyId, t]
  )

  const generate = useCallback(
    (prompt: string) =>
      runGeneration({ model, ratio, resolution, count }, prompt),
    [count, model, ratio, resolution, runGeneration]
  )

  /** Replays the failed request with the parameters it was sent with. */
  const retry = useCallback(() => {
    if (!generation) return
    void runGeneration(
      {
        model: generation.model,
        ratio: generation.ratio,
        resolution: generation.resolution,
        count: generation.count,
      },
      generation.prompt
    )
  }, [generation, runGeneration])

  /** Returns false when the prompt waits for the replace confirmation. */
  const submit = useCallback(
    (prompt: string) => {
      if (busy) return false
      if (generation) {
        setPendingPrompt(prompt)
        return false
      }
      void generate(prompt)
      return true
    },
    [busy, generate, generation]
  )

  const markSaved = useCallback(() => {
    setGeneration((current) =>
      current ? { ...current, saved: true } : current
    )
  }, [])

  /** Saves the given images and reports the outcome once for the batch. */
  const saveImages = useCallback(
    async (indices: number[]) => {
      if (indices.length === 0) return
      const images = generation?.images ?? []
      const results = await Promise.all(
        indices.map(async (index) => {
          const image = images[index]
          if (!image) return true
          const saved = await downloadImage(image, imageFilename(image, index))
          if (!saved) window.open(image, '_blank', 'noopener,noreferrer')
          return saved
        })
      )
      if (results.every(Boolean)) {
        markSaved()
        toast.success(t('Saved to your device'))
        return
      }
      toast.info(t('Opened in a new tab. Save the file there.'))
    },
    [generation, markSaved, t]
  )

  const download = useCallback(
    (index: number) => void saveImages([index]),
    [saveImages]
  )
  const downloadAll = useCallback(
    () => void saveImages((generation?.images ?? []).map((_, index) => index)),
    [generation, saveImages]
  )

  const unsaved = generation !== null && !generation.saved
  const zoomedImage =
    zoomIndex === null ? undefined : generation?.images[zoomIndex]

  return (
    <div className='mx-auto flex h-full min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 p-4'>
      {/* Results live in memory only, so leaving before a download loses them. */}
      <FormNavigationGuard
        when={unsaved}
        title={t('Result not downloaded')}
        message={t('Download the result first, or it will be lost.')}
      />
      <div className='border-border/70 bg-muted/30 flex shrink-0 items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-5'>
        <TriangleAlert
          className='text-warning mt-0.5 size-4 shrink-0'
          aria-hidden='true'
        />
        <p>
          <span className='font-medium'>
            {t('Test preview only, not a workbench')}
          </span>{' '}
          {t(
            'Nothing here is saved. Download anything you want to keep before leaving or generating again.'
          )}
        </p>
      </div>

      <div className='flex min-h-0 flex-1 flex-col gap-2'>
        <div className='flex shrink-0 items-start justify-between gap-3'>
          <div className='min-w-0 flex-1'>
            {generation ? (
              <>
                <p
                  className='line-clamp-2 text-sm leading-5'
                  title={generation.prompt}
                >
                  {generation.prompt}
                </p>
                <p className='text-muted-foreground mt-1 truncate text-xs'>
                  {generation.model} ·{' '}
                  {buildImageSize(generation.ratio, generation.resolution)} · ×
                  {generation.count}
                </p>
              </>
            ) : (
              <p className='text-muted-foreground text-xs'>
                {t('No result yet')}
              </p>
            )}
          </div>
          {generation && generation.images.length > 0 && (
            <Button variant='outline' size='sm' onClick={downloadAll}>
              <Download className='mr-2 size-4' aria-hidden='true' />
              {t('Download all')}
            </Button>
          )}
        </div>

        <div className='min-h-0 flex-1'>
          <ResultPanel
            generation={generation}
            onZoom={(index) => {
              setZoomIndex(index)
              setZoomOpen(true)
            }}
            onDownload={download}
            onRetry={retry}
          />
        </div>
      </div>

      <div className='shrink-0 space-y-2'>
        {noModels && (
          <Alert>
            <AlertTitle>{t('No image models are available')}</AlertTitle>
            <AlertDescription>
              {t(
                'Add a channel that supports image generation, then reload this page.'
              )}
            </AlertDescription>
          </Alert>
        )}

        {!keysLoading && keys.length === 0 && (
          <Alert>
            <AlertTitle>{t('Select an API key before generating')}</AlertTitle>
            <AlertDescription className='flex items-center gap-3'>
              {t('Create a key first, then come back to generate.')}
              <Button size='sm' variant='outline' render={<Link to='/keys' />}>
                {t('Create an API key')}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <GenerateComposer
          modelItems={modelItems}
          model={model}
          onModelChange={setPreferredModel}
          ratio={ratio}
          onRatioChange={setRatio}
          resolution={resolution}
          onResolutionChange={setResolution}
          count={count}
          onCountChange={setCount}
          keys={keys}
          selectedKeyId={selectedKeyId}
          onKeyChange={selectKey}
          onSubmit={submit}
          busy={busy}
          disabled={noModels || keys.length === 0}
        />
      </div>

      <ImageLightbox
        open={zoomOpen}
        onOpenChange={setZoomOpen}
        src={zoomedImage ?? ''}
        alt={generation?.prompt ?? ''}
        onDownload={() => {
          if (zoomIndex !== null) void download(zoomIndex)
        }}
      />

      <ConfirmDialog
        open={pendingPrompt !== null}
        onOpenChange={(open) => {
          if (!open) setPendingPrompt(null)
        }}
        title={t('Replace the current result?')}
        desc={t(
          'Generating again replaces this result. Download it first if you want to keep it.'
        )}
        confirmText={t('Generate anyway')}
        handleConfirm={() => {
          const prompt = pendingPrompt
          setPendingPrompt(null)
          if (prompt) void generate(prompt)
        }}
      />
    </div>
  )
}
