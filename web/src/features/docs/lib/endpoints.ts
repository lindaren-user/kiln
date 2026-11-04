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
 * Paths that exist on the gateway for image/video clients.
 * Models first; then image (sync) and video (async) blocks.
 */
export const DOCS_ENDPOINT_GROUPS: DocsEndpointGroup[] = [
  {
    endpoints: [
      {
        method: 'GET',
        path: '/v1/models',
        descriptionKey: 'List available models',
      },
    ],
  },
  {
    titleKey: 'Image',
    endpoints: [
      {
        method: 'POST',
        path: '/v1/images/generations',
        descriptionKey: 'Create an image generation (synchronous)',
      },
      {
        method: 'POST',
        path: '/v1/images/edits',
        descriptionKey: 'Edit an image (synchronous)',
      },
    ],
  },
  {
    titleKey: 'Video',
    endpoints: [
      {
        method: 'POST',
        path: '/v1/video/generations',
        descriptionKey: 'Create a video generation',
      },
      {
        method: 'GET',
        path: '/v1/video/generations/{task_id}',
        descriptionKey: 'Poll video task status and progress',
      },
      {
        method: 'POST',
        path: '/v1/videos',
        descriptionKey: 'Create a video (OpenAI Videos API)',
      },
      {
        method: 'GET',
        path: '/v1/videos/{task_id}',
        descriptionKey: 'Poll video status and progress',
      },
      {
        method: 'GET',
        path: '/v1/videos/{task_id}/content',
        descriptionKey: 'Download video content (Range supported)',
      },
      {
        method: 'HEAD',
        path: '/v1/videos/{task_id}/content',
        descriptionKey: 'Probe video content headers (Range supported)',
      },
      {
        method: 'POST',
        path: '/v1/videos/{video_id}/remix',
        descriptionKey: 'Remix an existing video',
      },
    ],
  },
]

/** Flat list for callers that only need every endpoint once. */
export const DOCS_ENDPOINTS: DocsEndpoint[] = DOCS_ENDPOINT_GROUPS.flatMap(
  (group) => group.endpoints
)
