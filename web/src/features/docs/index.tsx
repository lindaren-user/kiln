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
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { PublicLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import { resolvePublicOrigin } from '@/lib/public-origin'

import {
  DOCS_ENDPOINTS,
  DOCS_ENDPOINT_GROUPS,
  DOCS_VIDEO_PARAMETERS,
} from './lib/endpoints'
import { buildDocsMarkdown, downloadMarkdownFile } from './lib/export-markdown'

const linkClassName =
  'text-primary font-medium underline-offset-4 hover:underline'

const modelsResponse = `{
  "success": true,
  "object": "list",
  "data": [
    {
      "id": "gpt-image-2",
      "object": "model",
      "created": 1626777600,
      "owned_by": "custom",
      "supported_endpoint_types": ["image-generation"]
    }
  ]
}`

const imageResponse = `{
  "created": 1735689600,
  "data": [
    {
      "url": "https://cdn.example/kiln-at-dusk.png",
      "b64_json": "",
      "revised_prompt": ""
    }
  ]
}`

const videoResponse = `# POST /video/generations
{
  "id": "task_01J8Z9Q2X7",
  "task_id": "task_01J8Z9Q2X7",
  "status": "queued",
  "model": "minimaxh3",
  "created_at": 1735689600
}

# POST /videos
{
  "id": "task_01J8Z9Q2X7",
  "object": "video",
  "model": "minimaxh3",
  "status": "queued",
  "progress": 0,
  "created_at": 1735689600
}`

const assetResponse = `{
  "id": "assets://e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}`

const videoPollResponse = `# GET /video/generations/task_01J8Z9Q2X7 (in progress)
{
  "code": "success",
  "data": {
    "task_id": "task_01J8Z9Q2X7",
    "status": "IN_PROGRESS",
    "progress": "45%",
    "result_url": ""
  }
}

# GET /video/generations/task_01J8Z9Q2X7 (finished)
{
  "code": "success",
  "data": {
    "task_id": "task_01J8Z9Q2X7",
    "status": "SUCCESS",
    "progress": "100%",
    "result_url": "https://cdn.example/kiln-at-dusk.mp4"
  }
}

# GET /videos/task_01J8Z9Q2X7 (finished)
{
  "id": "task_01J8Z9Q2X7",
  "object": "video",
  "model": "minimaxh3",
  "status": "completed",
  "progress": 100,
  "created_at": 1735689600,
  "completed_at": 1735689900
}`

function CodeSample(props: { code: string }) {
  return (
    <div className='bg-muted/40 relative rounded-lg border'>
      <CopyButton
        value={props.code}
        className='absolute top-2 right-2 size-8'
        size='icon'
      />
      <pre className='overflow-x-auto p-4 pr-12 font-mono text-xs leading-6 whitespace-pre-wrap'>
        {props.code}
      </pre>
    </div>
  )
}

function Section(props: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={props.id} className='scroll-mt-24 space-y-3'>
      <h2 className='text-xl font-semibold tracking-tight'>{props.title}</h2>
      {props.children}
    </section>
  )
}

function EndpointGroups() {
  const { t } = useTranslation()
  return (
    <div className='space-y-4'>
      {DOCS_ENDPOINT_GROUPS.map((group, groupIndex) => (
        <div
          key={group.titleKey ?? `group-${groupIndex}`}
          className='space-y-2'
        >
          {group.titleKey ? (
            <h3 className='text-sm font-medium'>{t(group.titleKey)}</h3>
          ) : null}
          <div className='overflow-x-auto rounded-lg border'>
            <table className='w-full text-left text-sm'>
              <thead className='bg-muted/40 text-muted-foreground'>
                <tr>
                  <th className='px-3 py-2 font-medium whitespace-nowrap'>
                    {t('Method')}
                  </th>
                  <th className='px-3 py-2 font-medium whitespace-nowrap'>
                    {t('Path (relative to Base URL)')}
                  </th>
                  <th className='px-3 py-2 font-medium'>{t('Description')}</th>
                </tr>
              </thead>
              <tbody>
                {group.endpoints.map((endpoint) => (
                  <tr
                    key={`${endpoint.method} ${endpoint.path}`}
                    className='border-t'
                  >
                    <td className='px-3 py-2 font-mono text-xs whitespace-nowrap'>
                      {endpoint.method}
                    </td>
                    <td className='px-3 py-2 font-mono text-xs whitespace-nowrap'>
                      {endpoint.path}
                    </td>
                    <td className='px-3 py-2'>{t(endpoint.descriptionKey)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

/** The video creation body, including the reference media lists. */
function VideoParameterTable() {
  const { t } = useTranslation()
  return (
    <div className='overflow-x-auto rounded-lg border'>
      <table className='w-full text-left text-sm'>
        <thead className='bg-muted/40 text-muted-foreground'>
          <tr>
            <th className='px-3 py-2 font-medium whitespace-nowrap'>
              {t('Field')}
            </th>
            <th className='px-3 py-2 font-medium whitespace-nowrap'>
              {t('Type')}
            </th>
            <th className='px-3 py-2 font-medium whitespace-nowrap'>
              {t('Required')}
            </th>
            <th className='px-3 py-2 font-medium'>{t('Description')}</th>
          </tr>
        </thead>
        <tbody>
          {DOCS_VIDEO_PARAMETERS.map((parameter) => (
            <tr key={parameter.field} className='border-t'>
              <td className='px-3 py-2 font-mono text-xs whitespace-nowrap'>
                {parameter.field}
              </td>
              <td className='px-3 py-2 font-mono text-xs whitespace-nowrap'>
                {parameter.type}
              </td>
              {/* Required/Optional is a single word in every locale; without
                  nowrap the auto layout squeezes it to one character per line. */}
              <td className='px-3 py-2 whitespace-nowrap'>
                {parameter.required ? t('Required') : t('Optional')}
              </td>
              <td className='px-3 py-2'>{t(parameter.descriptionKey)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function DocsPage() {
  const { t } = useTranslation()
  const { status } = useStatus()

  const origin = resolvePublicOrigin(status?.server_address)
  const siteOrigin = String(origin).replace(/\/$/, '')
  const baseUrl = `${siteOrigin}/v1`

  const intro = t(
    'Call Kiln with an OpenAI-compatible API. Create a key in the console, then send requests to the base URL below.'
  )
  const baseUrlHint = t(
    'Point OpenAI-compatible SDKs at this base URL. Paths such as /images/generations and /videos are appended automatically.'
  )
  const authHint = t(
    'Create an API key under Console → API Keys, then send it as a Bearer token.'
  )
  const billingNote = t(
    'Failed calls are not charged. Reserved quota is refunded when the request or task fails.'
  )
  const modelsHint = t(
    'Browse enabled models, aspect ratios, and video lengths on the model list.'
  )
  const modelsListLinkLabel = t('Browse the full model list')
  const imageSyncNote = t(
    'Image generate and edit are synchronous: the response already contains the result. Save the image from the response; there is no image poll or later retrieve path. If waiting exceeds the gateway timeout, the HTTP call fails with 504, but a submitted upstream task may keep running—check task logs before retrying.'
  )
  const imageEditNote = t(
    'Image edit accepts two request shapes: multipart with the file in image=@file, or JSON with images as objects that each carry image_url. Only the JSON shape resolves assets:// IDs; a multipart upload sends the file bytes themselves.'
  )
  const videoFlowNote = t(
    'Video is asynchronous: create a task, poll until it reaches a terminal status (success or failure), then download content with GET /videos/{task_id}/content. Poll at a reasonable interval and stop after a terminal status.'
  )
  const referenceMediaNote = t(
    'Reference media can be a publicly reachable URL or an asset ID returned by POST /assets. The gateway resolves an asset ID to a signed URL internally before forwarding, so the URL is never exposed to callers. Each model accepts its own number of images, videos and audios; the model list shows the limit.'
  )
  const assetNote = t(
    'Uploading the same file twice returns the same asset ID.'
  )
  const cancelNote = t(
    'After upstream has accepted a generation, closing the client or cancelling the HTTP request does not stop it. Check task logs before retrying.'
  )
  const furtherHelp = t(
    'If the above does not solve your issue, please contact the administrator.'
  )
  const notes = [
    assetNote,
    imageSyncNote,
    imageEditNote,
    videoFlowNote,
    cancelNote,
  ]

  const sdkExample = `from openai import OpenAI

client = OpenAI(
    api_key="sk-your-key",
    base_url="${baseUrl}",
)

# List models
print(client.models.list())

# Image generation (synchronous)
image = client.images.generate(
    model="gpt-image-2",
    prompt="A kiln at dusk",
    n=1,
    size="1024x1024",
)
print(image.data[0].url or image.data[0].b64_json)`

  const modelsExample = `curl ${baseUrl}/models \\
  -H "Authorization: Bearer sk-your-key"`

  const imageExample = `curl ${baseUrl}/images/generations \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-2",
    "prompt": "A kiln at dusk",
    "n": 1,
    "size": "1024x1024"
  }'`

  const imageEditExample = `# Multipart: send the file itself
curl ${baseUrl}/images/edits \\
  -H "Authorization: Bearer sk-your-key" \\
  -F model=gpt-image-2 \\
  -F prompt="Make the kiln warmer at dusk" \\
  -F image=@/path/to/input.png

# JSON: reference images are objects carrying image_url
curl ${baseUrl}/images/edits \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-2",
    "prompt": "Make the kiln warmer at dusk",
    "images": [{"image_url": "https://cdn.example/kiln.png"}]
  }'`

  const assetExample = `curl ${baseUrl}/assets \\
  -H "Authorization: Bearer sk-your-key" \\
  -F file=@reference.png`

  const videoExample = `curl ${baseUrl}/video/generations \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "minimaxh3",
    "prompt": "A kiln at dusk",
    "seconds": 5,
    "size": "1280x720"
  }'

# OpenAI Videos API style:
curl ${baseUrl}/videos \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "minimaxh3",
    "prompt": "A kiln at dusk",
    "seconds": 5,
    "size": "1280x720"
  }'`

  const videoReferenceExample = `curl ${baseUrl}/video/generations \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "your-video-model",
    "prompt": "the same character, now walking through snow",
    "seconds": 6,
    "aspect_ratio": "16:9",
    "images": ["assets://e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    "reference_videos": ["https://cdn.example/camera-move.mp4"],
    "reference_audios": ["https://cdn.example/voice.mp3"]
  }'`

  const videoPollExample = `curl ${baseUrl}/video/generations/task_xxx \\
  -H "Authorization: Bearer sk-your-key"

# OpenAI Videos API style:
curl ${baseUrl}/videos/task_xxx \\
  -H "Authorization: Bearer sk-your-key"

curl ${baseUrl}/videos/task_xxx/content \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Range: bytes=0-" \\
  --output video.mp4`

  const examples = [
    { title: t('OpenAI SDK'), request: sdkExample },
    {
      title: t('List models'),
      request: modelsExample,
      response: modelsResponse,
    },
    {
      title: t('Image generation'),
      request: imageExample,
      response: imageResponse,
    },
    {
      title: t('Image edit'),
      request: imageEditExample,
      response: imageResponse,
    },
    {
      title: t('Upload a reference file'),
      request: assetExample,
      response: assetResponse,
    },
    {
      title: t('Video generation'),
      request: videoExample,
      response: videoResponse,
    },
    {
      title: t('Video with reference media'),
      request: videoReferenceExample,
    },
    {
      title: t('Poll video task'),
      request: videoPollExample,
      response: videoPollResponse,
    },
  ]

  const markdown = buildDocsMarkdown({
    labels: {
      title: t('API Documentation'),
      intro,
      baseUrl: t('Base URL'),
      baseUrlHint,
      authentication: t('Authentication'),
      authHint,
      billingNote,
      availableModels: t('Available models'),
      modelsHint,
      modelsListLinkLabel,
      endpoints: t('Endpoints'),
      method: t('Method'),
      path: t('Path (relative to Base URL)'),
      description: t('Description'),
      endpointDescriptions: Object.fromEntries(
        DOCS_ENDPOINTS.map((endpoint) => [
          endpoint.descriptionKey,
          t(endpoint.descriptionKey),
        ])
      ),
      groupTitles: Object.fromEntries(
        DOCS_ENDPOINT_GROUPS.flatMap((group) =>
          group.titleKey ? [[group.titleKey, t(group.titleKey)]] : []
        )
      ),
      videoParameters: t('Video parameters'),
      field: t('Field'),
      type: t('Type'),
      required: t('Required'),
      optional: t('Optional'),
      videoParameterDescriptions: Object.fromEntries(
        DOCS_VIDEO_PARAMETERS.map((parameter) => [
          parameter.descriptionKey,
          t(parameter.descriptionKey),
        ])
      ),
      referenceMediaNote,
      notes,
      examples: t('Examples'),
      response: t('Response'),
      furtherHelp,
    },
    baseUrl,
    siteOrigin,
    examples,
  })

  return (
    <PublicLayout>
      <article className='mx-auto flex max-w-3xl flex-col gap-10 py-8 md:py-12'>
        <header className='space-y-4'>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
            <h1 className='text-3xl font-bold tracking-tight md:text-4xl'>
              {t('API Documentation')}
            </h1>
            <div className='flex shrink-0 flex-wrap gap-2'>
              <CopyButton value={markdown} variant='outline' size='default'>
                {t('Copy')}
              </CopyButton>
              <Button
                variant='default'
                onClick={() =>
                  downloadMarkdownFile(markdown, 'kiln-api-docs.md')
                }
              >
                <Download className='size-4' aria-hidden='true' />
                {t('Download')}
              </Button>
            </div>
          </div>
          <p className='text-muted-foreground text-base leading-7'>{intro}</p>
        </header>

        <Section id='base-url' title={t('Base URL')}>
          <CodeSample code={baseUrl} />
          <p className='text-muted-foreground text-sm'>{baseUrlHint}</p>
        </Section>

        <Section id='auth' title={t('Authentication')}>
          <p className='text-muted-foreground text-sm leading-6'>{authHint}</p>
          <CodeSample code='Authorization: Bearer sk-your-key' />
          <p className='text-muted-foreground text-sm'>{billingNote}</p>
        </Section>

        <Section id='models' title={t('Available models')}>
          <p className='text-muted-foreground text-sm'>
            {modelsHint}{' '}
            <Link to='/pricing' className={linkClassName}>
              {modelsListLinkLabel}
            </Link>
          </p>
        </Section>

        <Section id='endpoints' title={t('Endpoints')}>
          <EndpointGroups />
          {notes.map((note) => (
            <p key={note} className='text-muted-foreground text-sm'>
              {note}
            </p>
          ))}
        </Section>

        <Section id='video-parameters' title={t('Video parameters')}>
          <VideoParameterTable />
          <p className='text-muted-foreground text-sm'>{referenceMediaNote}</p>
        </Section>

        <Section id='examples' title={t('Examples')}>
          <div className='space-y-4'>
            {examples.map((example) => (
              <div key={example.title} className='space-y-2'>
                <h3 className='text-sm font-medium'>{example.title}</h3>
                <CodeSample code={example.request} />
                {example.response ? (
                  <>
                    <h4 className='text-muted-foreground text-xs font-medium'>
                      {t('Response')}
                    </h4>
                    <CodeSample code={example.response} />
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </Section>

        <p className='text-muted-foreground text-sm leading-6'>{furtherHelp}</p>
      </article>
    </PublicLayout>
  )
}
