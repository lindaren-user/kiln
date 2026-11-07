/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { describe, expect, it } from 'vitest'

import { DOCS_VIDEO_PARAMETERS } from '../lib/endpoints'
import { buildDocsMarkdown } from '../lib/export-markdown'

function labels() {
  return {
    title: 'API Documentation',
    intro: 'intro',
    baseUrl: 'Base URL',
    baseUrlHint: 'base url hint',
    authentication: 'Authentication',
    authHint: 'auth hint',
    billingNote: 'billing',
    availableModels: 'Available models',
    modelsHint: 'models',
    modelsListLinkLabel: 'browse',
    endpoints: 'Endpoints',
    method: 'Method',
    path: 'Path',
    description: 'Description',
    endpointDescriptions: {},
    image: 'Image',
    video: 'Video',
    videoParameters: 'Video parameters',
    field: 'Field',
    type: 'Type',
    required: 'Required',
    optional: 'Optional',
    videoParameterDescriptions: {},
    referenceMediaNote: 'reference media note',
    videoReference: 'Video with reference media',
    imageSyncNote: 'image note',
    videoFlowNote: 'video note',
    cancelNote: 'cancel note',
    examples: 'Examples',
    sdkExample: 'OpenAI SDK',
    listModelsHeading: 'List models',
    imageGeneration: 'Image generation',
    imageEdit: 'Image edit',
    videoGeneration: 'Video generation',
    videoPoll: 'Poll video task',
    furtherHelp: 'help',
  }
}

const input = {
  labels: labels(),
  baseUrl: 'https://kiln.example/v1',
  siteOrigin: 'https://kiln.example',
  sdkExample: 'sdk',
  modelsExample: 'models',
  imageExample: 'image',
  imageEditExample: 'edit',
  videoExample: 'video',
  videoReferenceExample: 'video with references',
  videoPollExample: 'poll',
}

describe('docs markdown', () => {
  it('documents the reference media fields the video body accepts', () => {
    const markdown = buildDocsMarkdown(input)

    for (const parameter of DOCS_VIDEO_PARAMETERS) {
      expect(markdown).toContain(`\`${parameter.field}\``)
    }
    // The three reference lists are what a caller cannot guess on their own.
    expect(markdown).toContain('`images`')
    expect(markdown).toContain('`reference_videos`')
    expect(markdown).toContain('`reference_audios`')
    expect(markdown).toContain('reference media note')
  })

  it('keeps the reference media example beside the plain one', () => {
    const markdown = buildDocsMarkdown(input)

    expect(markdown).toContain('### Video with reference media')
    expect(markdown).toContain('video with references')
  })
})
