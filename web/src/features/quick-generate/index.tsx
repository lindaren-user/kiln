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
import { nanoid } from 'nanoid'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { generateImages, resolveApiKey } from '@/features/image-generation/api'
import { FormNavigationGuard } from '@/features/system-settings/components/form-navigation-guard'

import {
  submitDraftUpgrade,
  submitVideo,
  uploadQuickGenerateReferences,
} from './api'
import { GenerateComposer } from './components/generate-composer'
import { MediaLightbox } from './components/media-lightbox'
import { ResultPanel } from './components/result-panel'
import { UsageNotice } from './components/usage-notice'
import { useGenerationModels } from './hooks/use-generation-models'
import {
  buildImageRequest,
  buildVideoRequest,
  capabilityFor,
  compatibleValues,
} from './lib/capabilities'
import { downloadMedia, mediaFilename } from './lib/download-media'
import { loadComposerDraft, saveComposerDraft } from './lib/draft-storage'
import { referenceKind } from './lib/file-mention'
import { pollVideoTask } from './lib/poll-video'
import { resolveQuickGenerateKey } from './lib/quick-generate-key'
import {
  clearRunningVideoTask,
  loadRunningVideoTask,
  saveRunningVideoTask,
  type RunningVideoTask,
} from './lib/video-task-storage'
import type {
  Generation,
  GenerationParams,
  GenerationValues,
  ReferenceAttachment,
} from './types'

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

  // TODO: list the recent generations under the result. The page already
  // tracks every run by id (including the polled video tasks), so the list
  // should read that state instead of adding a second request path.

  // A video task outlives the page: the stored run is shown again on mount and
  // polling continues from its task id. An image has nothing to rejoin.
  const [restoredTask] = useState(loadRunningVideoTask)
  const [generation, setGeneration] = useState<Generation | null>(restoredTask)
  // The unsent draft — prompt, model and its parameters — is restored from the
  // previous visit. The result below is not: media stays in memory only.
  const [draft] = useState(loadComposerDraft)
  const [prompt, setPrompt] = useState(draft.prompt)
  const [preferredModel, setPreferredModel] = useState(draft.model)
  const [values, setValues] = useState<GenerationValues>(draft.values)
  // `zoomIndex` outlives the open state so the closing animation never renders
  // an empty image, which used to look like a second dialog flashing open.
  const [zoomIndex, setZoomIndex] = useState<number | null>(null)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [pendingPrompt, setPendingPrompt] = useState<{
    prompt: string
    references: ReferenceAttachment[]
  } | null>(null)
  // Upgrading a sample starts a second, separately priced run, so it asks first.
  const [confirmUpgrade, setConfirmUpgrade] = useState(false)
  // Identifies the generation that may still write to state; a newer one, or
  // leaving the page, cancels the video poll of an older one.
  const activeRunRef = useRef('')
  // The key is resolved once per visit. A failed resolution clears the cache,
  // so the next run asks again instead of repeating the same error.
  const keyPromise = useRef<Promise<{ id: number; apiKey: string }> | null>(
    null
  )
  const resolveKey = useCallback(() => {
    keyPromise.current ??= resolveQuickGenerateKey().catch((error: unknown) => {
      keyPromise.current = null
      throw error
    })
    return keyPromise.current
  }, [])
  // Reference media is uploaded before the vendor call; the composer shows a
  // spinner instead of a success message, and only blocks submitting again.
  const [uploadingReferences, setUploadingReferences] = useState(false)

  // A remembered model that is gone falls back to the first available one.
  const model = models.some((item) => item.name === preferredModel)
    ? preferredModel
    : (models[0]?.name ?? '')
  const modelDescription = model ? descriptionFor(model) : ''
  const promptPlaceholder = modelDescription
    ? modelDescription
    : t('This model has no description yet.')
  const selectedModel = models.find((item) => item.name === model)
  const kind = selectedModel?.kind ?? ('image' as const)
  const capability = useMemo(
    () => selectedModel?.capability ?? capabilityFor(kind),
    [kind, selectedModel]
  )
  const effectiveValues = useMemo(
    () => compatibleValues(capability, values),
    [capability, values]
  )
  const runPrice = useMemo(() => {
    if (!model) return ''
    if (kind === 'video') {
      return priceForRun(
        model,
        { seconds: Number(effectiveValues.seconds ?? 0) },
        effectiveValues
      )
    }
    return priceForRun(
      model,
      { count: Number(effectiveValues.count ?? 1) },
      effectiveValues
    )
  }, [effectiveValues, kind, model, priceForRun])

  // A different model accepts a different set of parameters, so switching the
  // model drops the previous model's values instead of sending them again.
  const changeModel = useCallback((next: string) => {
    setPreferredModel(next)
    setValues({})
  }, [])

  // StrictMode rehearses an unmount right after mounting, then runs the
  // effects again. Re-arming in the setup keeps that rehearsal from cancelling
  // a poll that is still wanted; a real unmount leaves it false.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Keep the draft with every edit, so leaving the page or reloading loses
  // nothing the user typed.
  useEffect(() => {
    saveComposerDraft({ prompt, model: preferredModel, values })
  }, [preferredModel, prompt, values])

  const busy = generation?.status === 'running'
  const noModels = !modelsLoading && models.length === 0

  /** Writes a patch into the run with this id; a replaced run is left alone. */
  const applyRunPatch = useCallback(
    (id: string, patch: Partial<Generation>) => {
      setGeneration((current) =>
        current?.id === id ? { ...current, ...patch } : current
      )
    },
    []
  )

  /**
   * Polls a submitted task and writes its outcome into the result panel. The
   * stored record is cleared only when the task settles: a task the page stops
   * waiting for is picked up again after a reload.
   */
  const followVideoTask = useCallback(
    async (task: RunningVideoTask, apiKey: string) => {
      const isCancelled = () =>
        !mounted.current || activeRunRef.current !== task.id
      let storedProgress = task.progress
      const url = await pollVideoTask({
        apiKey,
        taskId: task.taskId,
        startProgress: task.progress,
        isCancelled,
        onProgress: (progress) => {
          applyRunPatch(task.id, { progress })
          // Keep the stored copy current, so a reload resumes at this point.
          if (progress !== storedProgress) {
            storedProgress = progress
            saveRunningVideoTask({ ...task, progress })
          }
        },
      })
      if (url === null || isCancelled()) return
      clearRunningVideoTask()
      applyRunPatch(task.id, {
        status: 'done',
        progress: undefined,
        media: [{ url, type: 'video' }],
      })
    },
    [applyRunPatch]
  )

  /**
   * Resolves the task's key, polls it, and settles its outcome. A fresh
   * submission and the task restored after a reload both enter here.
   */
  const runVideoTask = useCallback(
    async (task: RunningVideoTask, submittedWith?: string) => {
      const isCancelled = () => activeRunRef.current !== task.id
      try {
        const apiKey = submittedWith ?? (await resolveApiKey(task.keyId))
        if (isCancelled()) return
        await followVideoTask(task, apiKey)
      } catch (error) {
        if (isCancelled()) return
        clearRunningVideoTask()
        applyRunPatch(task.id, {
          status: 'error',
          error:
            error instanceof Error ? error.message : t('Generation failed'),
        })
      }
    },
    [applyRunPatch, followVideoTask, t]
  )

  const runGeneration = useCallback(
    async (params: GenerationParams, prompt: string) => {
      if (!params.model) return

      const id = nanoid()
      activeRunRef.current = id
      // Any new run replaces the remembered task; the one upstream still
      // stays in the task log.
      clearRunningVideoTask()
      setZoomIndex(null)
      setZoomOpen(false)
      const run: Generation = {
        ...params,
        id,
        prompt,
        status: 'running',
        media: [],
        saved: false,
        startedAt: Date.now(),
      }
      setGeneration(run)

      const isCancelled = () => !mounted.current || activeRunRef.current !== id

      try {
        // Created on the first run, reused afterwards; the page never asks the
        // user to pick or make a key. The references upload does not wait on
        // the key, so the two travel together.
        setUploadingReferences(params.references.length > 0)
        const [{ id: keyId, apiKey }, uploadedReferences] = await Promise.all([
          resolveKey(),
          uploadQuickGenerateReferences(params.references),
        ])
        setUploadingReferences(false)
        if (isCancelled()) return
        const imageReferences = uploadedReferences
          .filter((reference) => referenceKind(reference) === 'image')
          .map((reference) => reference.url)

        if (params.kind === 'video') {
          // A draft upgrade inherits the sample's prompt and media, so only the
          // sample id and the target tier are sent.
          const taskId = params.draftTaskId
            ? await submitDraftUpgrade({
                apiKey,
                model: params.model,
                draftTaskId: params.draftTaskId,
              })
            : await submitVideo({
                apiKey,
                model: params.model,
                prompt,
                request: buildVideoRequest(
                  params.values,
                  params.capability,
                  imageReferences,
                  uploadedReferences
                ),
              })
          // The task now lives upstream: remember it before waiting, so even
          // leaving the page right now can be resumed. The stored references
          // are the uploaded ones, which still resolve after a reload.
          const task: RunningVideoTask = {
            ...run,
            references: uploadedReferences,
            taskId,
            keyId,
          }
          saveRunningVideoTask(task)
          // The settled task id stays on the result so a sample can be upgraded.
          applyRunPatch(id, { taskId })
          await runVideoTask(task, apiKey)
          return
        }

        const request = buildImageRequest(
          params.values,
          params.capability,
          imageReferences
        )
        const images = await generateImages({
          apiKey,
          model: params.model,
          prompt,
          parameters: request,
          operation: params.capability.referenceImages?.edit
            ? 'edit'
            : 'generate',
        })
        if (isCancelled()) return
        applyRunPatch(id, {
          status: 'done',
          media: images.map((url) => ({ url, type: 'image' })),
        })
      } catch (error) {
        setUploadingReferences(false)
        if (isCancelled()) return
        applyRunPatch(id, {
          status: 'error',
          error:
            error instanceof Error ? error.message : t('Generation failed'),
        })
      }
    },
    [applyRunPatch, resolveKey, runVideoTask, t]
  )

  // Rejoin the video task the previous visit left running. The guard keeps a
  // language change (which recreates `t`) from starting a second poll; the
  // mounted flag above keeps the StrictMode rehearsal from cancelling the one
  // poll that was started.
  const resumed = useRef(false)
  useEffect(() => {
    if (!restoredTask || resumed.current) return
    resumed.current = true
    activeRunRef.current = restoredTask.id
    void runVideoTask(restoredTask)
  }, [restoredTask, runVideoTask])

  const generate = useCallback(
    (prompt: string, references: ReferenceAttachment[]) =>
      runGeneration(
        {
          model,
          kind,
          capability,
          values: effectiveValues,
          references,
        },
        prompt
      ),
    [capability, effectiveValues, kind, model, runGeneration]
  )

  /** Replays the failed request with the parameters it was sent with. */
  const retry = useCallback(() => {
    if (!generation) return
    void runGeneration(
      {
        model: generation.model,
        kind: generation.kind,
        capability: generation.capability,
        values: generation.values,
        references: generation.references,
        draftTaskId: generation.draftTaskId,
      },
      generation.prompt
    )
  }, [generation, runGeneration])

  // A finished 480p sample can become a 1080p final while the vendor still
  // holds it (seven days); the task id is the public gateway id.
  const upgradeableTaskId =
    generation?.kind === 'video' &&
    generation.status === 'done' &&
    generation.taskId &&
    generation.values.draft === 'true'
      ? generation.taskId
      : null

  const upgradeDraft = useCallback(() => {
    if (!generation || !upgradeableTaskId) return
    void runGeneration(
      {
        model: generation.model,
        kind: 'video',
        capability: generation.capability,
        // The final is no longer a sample, so its own result offers no upgrade.
        values: { ...generation.values, draft: 'false' },
        references: [],
        draftTaskId: upgradeableTaskId,
      },
      generation.prompt
    )
  }, [generation, runGeneration, upgradeableTaskId])

  /** Returns false when the prompt waits for the replace confirmation. */
  const submit = useCallback(
    (prompt: string, references: ReferenceAttachment[]) => {
      const replacesResult =
        generation?.status === 'running' ||
        (generation?.status === 'done' &&
          generation.media.length > 0 &&
          !generation.saved)
      if (replacesResult) {
        setPendingPrompt({ prompt, references })
        return false
      }
      void generate(prompt, references)
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

  // A running video is resumable, so leaving the page costs nothing. An image
  // cannot be rejoined, so the warning is the only way to keep its result.
  const runningImage = busy && generation?.kind === 'image'
  const unsaved =
    runningImage ||
    (generation?.status === 'done' &&
      generation.media.length > 0 &&
      !generation.saved)
  const zoomedImage =
    zoomIndex === null ? undefined : generation?.media[zoomIndex]?.url

  return (
    <div className='mx-auto flex h-full min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 p-4'>
      {/* A running video is picked up again from its task id, so only an
          image in flight and an unsaved result warn before leaving. */}
      <FormNavigationGuard
        when={unsaved}
        title={t(
          runningImage ? 'Image still generating' : 'Result not downloaded'
        )}
        message={t(
          runningImage
            ? 'Leaving this page stops waiting for the image, and the result will not appear here.'
            : 'Download the result first, or it will be lost.'
        )}
      />
      <UsageNotice />

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
            onUpgradeDraft={
              upgradeableTaskId ? () => setConfirmUpgrade(true) : undefined
            }
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

        <GenerateComposer
          modelItems={modelItems}
          model={model}
          promptPlaceholder={promptPlaceholder}
          onModelChange={changeModel}
          capability={capability}
          prompt={prompt}
          onPromptChange={setPrompt}
          values={effectiveValues}
          onValueChange={(key, value) =>
            setValues((current) => ({ ...current, [key]: value }))
          }
          onSubmit={submit}
          busy={busy}
          uploading={uploadingReferences}
          disabled={noModels}
        />
      </div>

      <MediaLightbox
        open={zoomOpen}
        onOpenChange={setZoomOpen}
        src={zoomedImage ?? ''}
        alt={generation?.prompt ?? ''}
        kind='image'
        onDownload={() => {
          if (zoomIndex !== null) void download(zoomIndex)
        }}
      />

      <ConfirmDialog
        open={confirmUpgrade}
        onOpenChange={setConfirmUpgrade}
        title={t('Upgrade the sample to 1080p?')}
        desc={t(
          "The 1080p final inherits this sample's prompt, media and settings, is billed at the 1080p price, and replaces the sample here."
        )}
        confirmText={t('Upgrade to 1080p')}
        handleConfirm={() => {
          setConfirmUpgrade(false)
          upgradeDraft()
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
          if (pending) void generate(pending.prompt, pending.references)
        }}
      />
    </div>
  )
}
