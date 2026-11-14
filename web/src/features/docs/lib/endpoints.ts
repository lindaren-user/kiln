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

/** Public AI endpoints this docs page covers for Kiln callers. */
export type DocsEndpoint = {
  method: 'GET' | 'POST' | 'HEAD'
  path: string
  descriptionKey: string
}

export type DocsEndpointGroup = {
  /** i18n key for the group heading; omit for an ungrouped lead block. */
  titleKey?: string
  endpoints: DocsEndpoint[]
}

/**
 * Paths on the gateway, relative to the API base URL (/v1).
 * Models first; then image (sync) and video (async) blocks.
 */
export const DOCS_ENDPOINT_GROUPS: DocsEndpointGroup[] = [
  {
    endpoints: [
      {
        method: 'GET',
        path: '/models',
        descriptionKey: 'List available models',
      },
    ],
  },
  {
    titleKey: 'Assets',
    endpoints: [
      {
        method: 'POST',
        path: '/assets',
        descriptionKey:
          'Upload a reference file once and get an asset ID to reuse',
      },
    ],
  },
  {
    titleKey: 'Image',
    endpoints: [
      {
        method: 'POST',
        path: '/images/generations',
        descriptionKey: 'Create an image generation (synchronous)',
      },
      {
        method: 'POST',
        path: '/images/edits',
        descriptionKey: 'Edit an image (synchronous)',
      },
    ],
  },
  {
    titleKey: 'Video',
    endpoints: [
      {
        method: 'POST',
        path: '/video/generations',
        descriptionKey: 'Create a video generation',
      },
      {
        method: 'GET',
        path: '/video/generations/{task_id}',
        descriptionKey: 'Poll video task status and progress',
      },
      {
        method: 'POST',
        path: '/videos',
        descriptionKey: 'Create a video (OpenAI Videos API)',
      },
      {
        method: 'GET',
        path: '/videos/{task_id}',
        descriptionKey: 'Poll video status and progress',
      },
      {
        method: 'GET',
        path: '/videos/{task_id}/content',
        descriptionKey: 'Download video content (Range supported)',
      },
    ],
  },
]

/** Flat list for callers that only need every endpoint once. */
export const DOCS_ENDPOINTS: DocsEndpoint[] = DOCS_ENDPOINT_GROUPS.flatMap(
  (group) => group.endpoints
)

/** One request field of the video creation body. */
export type DocsVideoParameter = {
  /** Wire name, sent as-is. */
  field: string
  type: string
  required: boolean
  descriptionKey: string
}

/**
 * The video creation body both video endpoints take. Reference media is a
 * list of URLs on the vendor's side, so every entry is either a public URL or
 * an assets:// ID the gateway resolves to a signed URL before forwarding.
 */
export const DOCS_VIDEO_PARAMETERS: DocsVideoParameter[] = [
  {
    field: 'model',
    type: 'string',
    required: true,
    descriptionKey: 'Model ID from the model list.',
  },
  {
    field: 'prompt',
    type: 'string',
    required: true,
    descriptionKey: 'Prompt describing the video.',
  },
  {
    field: 'seconds',
    type: 'int',
    required: false,
    descriptionKey:
      'Clip length in seconds; the model list shows the accepted values.',
  },
  {
    field: 'size',
    type: 'string',
    required: false,
    descriptionKey:
      'Output size or aspect ratio, e.g. 1280x720 or 16:9. aspect_ratio and resolution are accepted the same way.',
  },
  {
    field: 'images',
    type: 'string[]',
    required: false,
    descriptionKey: 'Reference images: public URLs or assets:// IDs.',
  },
  {
    field: 'reference_videos',
    type: 'string[]',
    required: false,
    descriptionKey: 'Reference videos: public URLs or assets:// IDs.',
  },
  {
    field: 'reference_audios',
    type: 'string[]',
    required: false,
    descriptionKey: 'Reference audios: public URLs or assets:// IDs.',
  },
]

/**
 * Creation options of the Seedance video models. They travel inside
 * `metadata`; other models do not read them.
 */
export const DOCS_SEEDANCE_PARAMETERS: DocsVideoParameter[] = [
  {
    field: 'metadata.resolution',
    type: 'string',
    required: false,
    descriptionKey:
      'Output resolution tier: 480p, 720p, 1080p or 4k, depending on the model.',
  },
  {
    field: 'metadata.ratio',
    type: 'string',
    required: false,
    descriptionKey:
      'Aspect ratio such as 16:9 or adaptive. Seedance 2.5 first/last-frame requests must use adaptive.',
  },
  {
    field: 'metadata.image_mode',
    type: 'string',
    required: false,
    descriptionKey:
      'Role of attached images: reference, first_frame or first_last.',
  },
  {
    field: 'metadata.generate_audio',
    type: 'boolean',
    required: false,
    descriptionKey:
      'Generate audio (default true); audio and silent video are priced the same.',
  },
  {
    field: 'metadata.return_last_frame',
    type: 'boolean',
    required: false,
    descriptionKey: 'Return the last frame as an image.',
  },
  {
    field: 'metadata.watermark',
    type: 'boolean',
    required: false,
    descriptionKey: 'Add a watermark to the output.',
  },
  {
    field: 'metadata.seed',
    type: 'int',
    required: false,
    descriptionKey: 'Seed for reproducible generations.',
  },
  {
    field: 'metadata.draft',
    type: 'boolean',
    required: false,
    descriptionKey:
      'Create a 480p sample first (Seedance 2.5). Send the sample task ID back to render the final video.',
  },
  {
    field: 'metadata.content',
    type: 'object[]',
    required: false,
    descriptionKey:
      'Ark-style content list. Reference media are URL items; a draft_task item upgrades a finished sample.',
  },
]
