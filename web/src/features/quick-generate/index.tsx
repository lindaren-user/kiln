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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { generateImages, resolveApiKey } from '@/features/image-generation/api'
import { useImageApiKeys } from '@/features/image-generation/hooks/use-image-api-keys'
import { FormNavigationGuard } from '@/features/system-settings/components/form-navigation-guard'

import { submitVideo } from './api'
import { GenerateComposer } from './components/generate-composer'
import { ImageLightbox } from './components/image-lightbox'
import { ResultPanel } from './components/result-panel'
import { useGenerationModels } from './hooks/use-generation-models'
import {
  buildImageRequest,
  buildVideoRequest,
  capabilityFor,
  compatibleValues,
} from './lib/capabilities'
import { downloadMedia, mediaFilename } from './lib/download-media'
import { pollVideoTask } from './lib/poll-video'
import type { Generation, GenerationParams, GenerationValues } from './types'

/**
 * Single-result checks for image and video models. Each generation replaces
 * the last one, nothing is persisted, and an undownloaded result warns before
 * the page unloads.
 */
export function QuickGenerate() {
  const { t } = useTranslation()
  const {
    models,
    items: modelItems,
    descriptionFor,
    priceForRun,
    isLoading: modelsLoading,
  } = useGenerationModels()
  const {
    keys,
    selectedKeyId,
    selectKey,
    isLoading: keysLoading,
  } = useImageApiKeys()

  const [generation, setGeneration] = useState<Generation | null>(null)
  const [preferredModel, setPreferredModel] = useState('')
  const [values, setValues] = useState<GenerationValues>({})
  // `zoomIndex` outlives the open state so the closing animation never renders
  // an empty image, which used to look like a second dialog flashing open.
  const [zoomIndex, setZoomIndex] = useState<number | null>(null)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [pendingPrompt, setPendingPrompt] = useState<{
    prompt: string
    images: string[]
  } | null>(null)
  // Identifies the generation that may still write to state; a newer one, or
  // leaving the page, cancels the video poll of an older one.
  const activeRunRef = useRef('')

  // A remembered model that is gone falls back to the first available one.
  const model = models.some((item) => item.name === preferredModel)
    ? preferredModel
    : (models[0]?.name ?? '')
  const modelDescription = model ? descriptionFor(model) : ''
  const promptPlaceholder = modelDescription
    ? modelDescription
    : t('This model has no description yet.')
  const kind =
    models.find((item) => item.name === model)?.kind ?? ('image' as const)
  const capability = useMemo(() => capabilityFor(model, kind), [model, kind])
  const effectiveValues = useMemo(
    () => compatibleValues(capability, values),
    [capability, values]
  )
  const runPrice = useMemo(() => {
    if (!model) return ''
    if (kind === 'video') {
      return priceForRun(model, {
        seconds: buildVideoRequest(effectiveValues, model).duration,
      })
    }
    return priceForRun(model, {
      count: buildImageRequest(effectiveValues, model).count,
    })
  }, [effectiveValues, kind, model, priceForRun])

  // A different model accepts a different set of parameters, so switching the
  // model drops the previous model's values instead of sending them again.
  const changeModel = useCallback((next: string) => {
    setPreferredModel(next)
    setValues({})
  }, [])

  useEffect(
    () => () => {
      activeRunRef.current = ''
    },
    []
  )

  const busy = generation?.status === 'running'
  const noModels = !modelsLoading && models.length === 0

  const runGeneration = useCallback(
    async (params: GenerationParams, prompt: string) => {
      if (!params.model || selectedKeyId === null) return

      const id = nanoid()
      activeRunRef.current = id
      setZoomIndex(null)
      setZoomOpen(false)
      setGeneration({
        ...params,
        id,
        prompt,
        status: 'running',
        media: [],
        saved: false,
      })

      const isCancelled = () => activeRunRef.current !== id

      try {
        const apiKey = await resolveApiKey(selectedKeyId)

        if (params.kind === 'video') {
          const taskId = await submitVideo({
            apiKey,
            model: params.model,
            prompt,
            request: buildVideoRequest(params.values, params.model, params.images),
          })
          const url = await pollVideoTask({
            apiKey,
            taskId,
            isCancelled,
            onProgress: (progress) => {
              setGeneration((current) =>
                current?.id === id ? { ...current, progress } : current
              )
            },
          })
          if (url === null || isCancelled()) return
          setGeneration((current) =>
            current?.id === id
              ? {
                  ...current,
                  status: 'done',
                  progress: undefined,
                  media: [{ url, type: 'video' }],
                }
              : current
          )
          return
        }

        const request = buildImageRequest(
          params.values,
          params.model,
          params.images
        )
        const images = await generateImages({
          apiKey,
          model: params.model,
          prompt,
          size: request.size,
          count: request.count,
          quality: request.quality,
          image: request.image,
          images: request.images,
        })
        if (isCancelled()) return
        setGeneration((current) =>
          current?.id === id
            ? {
                ...current,
                status: 'done',
                media: images.map((url) => ({ url, type: 'image' })),
              }
            : current
        )
      } catch (error) {
        if (isCancelled()) return
        setGeneration((current) =>
          current?.id === id
            ? {
                ...current,
                status: 'error',
                error:
                  error instanceof Error
                    ? error.message
                    : t('Generation failed'),
              }
            : current
        )
      }
    },
    [selectedKeyId, t]
  )

  const generate = useCallback(
    (prompt: string, images: string[]) =>
      runGeneration(
        {
          model,
          kind,
          values: effectiveValues,
          images,
        },
        prompt
      ),
    [effectiveValues, kind, model, runGeneration]
  )

  /** Replays the failed request with the parameters it was sent with. */
  const retry = useCallback(() => {
    if (!generation) return
    void runGeneration(
      {
        model: generation.model,
        kind: generation.kind,
        values: generation.values,
        images: generation.images,
      },
      generation.prompt
    )
  }, [generation, runGeneration])

  /** Returns false when the prompt waits for the replace confirmation. */
  const submit = useCallback(
    (prompt: string, images: string[]) => {
      const replacesResult =
        generation?.status === 'running' ||
        (generation?.status === 'done' &&
          generation.media.length > 0 &&
          !generation.saved)
      if (replacesResult) {
        setPendingPrompt({ prompt, images })
        return false
      }
      void generate(prompt, images)
      return true
    },
    [generate, generation]
  )

  const markSaved = useCallback(() => {
    setGeneration((current) =>
      current ? { ...current, saved: true } : current
    )
  }, [])

  /** Saves the given media and reports the outcome once for the batch. */
  const saveMedia = useCallback(
    async (indices: number[]) => {
      if (indices.length === 0) return
      const media = generation?.media ?? []
      const results = await Promise.all(
        indices.map(async (index) => {
          const item = media[index]
          if (!item) return true
          const saved = await downloadMedia(
            item.url,
            mediaFilename(
              item.url,
              index,
              item.type === 'video' ? 'mp4' : 'png'
            )
          )
          if (!saved) window.open(item.url, '_blank', 'noopener,noreferrer')
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
    (index: number) => void saveMedia([index]),
    [saveMedia]
  )
  const downloadAll = useCallback(
    () => void saveMedia((generation?.media ?? []).map((_, index) => index)),
    [generation, saveMedia]
  )

  const unsaved =
    generation?.status === 'running' ||
    (generation?.status === 'done' &&
      generation.media.length > 0 &&
      !generation.saved)
  const zoomedImage =
    zoomIndex === null ? undefined : generation?.media[zoomIndex]?.url

  return (
    <div className='mx-auto flex h-full min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 p-4'>
      {/* Images stay in memory. Completed videos remain in the task log. */}
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
            {t('For testing only. Using this as a workbench is not recommended.')}
          </span>{' '}
          {t(
            'Images are not saved. Videos can be opened from "Task logs → Artifacts". Download any image you want to keep before leaving or generating again.'
          )}{' '}
          {t(
            'After upstream has accepted a generation, leaving this page or stopping the browser request does not cancel it. Check task logs before trying again.'
          )}
        </p>
      </div>

      <div className='flex min-h-0 flex-1 flex-col gap-2'>
        {generation && generation.media.length > 0 && (
          <div className='flex shrink-0 justify-end'>
            <Button variant='outline' size='sm' onClick={downloadAll}>
              <Download className='mr-2 size-4' aria-hidden='true' />
              {generation.kind === 'video' ? t('Download') : t('Download all')}
            </Button>
          </div>
        )}

        <div className='min-h-0 flex-1'>
          <ResultPanel
            generation={generation}
            runPrice={runPrice}
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
            <AlertTitle>{t('No generation models are available')}</AlertTitle>
            <AlertDescription>
              {t(
                'Add a channel that supports image or video generation, then reload this page.'
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
          promptPlaceholder={promptPlaceholder}
          onModelChange={changeModel}
          capability={capability}
          values={effectiveValues}
          onValueChange={(key, value) =>
            setValues((current) => ({ ...current, [key]: value }))
          }
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
          const pending = pendingPrompt
          setPendingPrompt(null)
          if (pending) void generate(pending.prompt, pending.images)
        }}
      />
    </div>
  )
}
