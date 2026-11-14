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
import {
  DOCS_ENDPOINT_GROUPS,
  DOCS_SEEDANCE_PARAMETERS,
  DOCS_VIDEO_PARAMETERS,
  type DocsVideoParameter,
} from './endpoints'

export type DocsMarkdownLabels = {
  title: string
  intro: string
  baseUrl: string
  baseUrlHint: string
  authentication: string
  authHint: string
  billingNote: string
  availableModels: string
  modelsHint: string
  modelsListLinkLabel: string
  endpoints: string
  method: string
  path: string
  description: string
  endpointDescriptions: Record<string, string>
  groupTitles: Record<string, string>
  videoParameters: DocsParameterSectionLabels
  field: string
  type: string
  required: string
  optional: string
  seedanceParameters: DocsParameterSectionLabels
  /** Notes for the endpoints section, in the order they are shown. */
  notes: string[]
  examples: string
  response: string
  furtherHelp: string
}

/** One worked example: the request as sent, and the reply it produces. */
export type DocsMarkdownExample = {
  title: string
  request: string
  response?: string
}

export type DocsMarkdownInput = {
  labels: DocsMarkdownLabels
  baseUrl: string
  siteOrigin: string
  examples: DocsMarkdownExample[]
}

function fence(code: string) {
  return `\`\`\`\n${code}\n\`\`\``
}

/** One parameter table's heading and surrounding notes. */
export type DocsParameterSectionLabels = {
  title: string
  descriptions: Record<string, string>
  leadNote?: string
  footnote?: string
}

/** Appends one titled parameter table, with an optional lead note and footnote. */
function pushParameterTable(
  lines: string[],
  labels: DocsMarkdownLabels,
  section: DocsParameterSectionLabels,
  parameters: DocsVideoParameter[]
) {
  lines.push(`## ${section.title}`, '')
  if (section.leadNote) lines.push(section.leadNote, '')
  lines.push(
    `| ${labels.field} | ${labels.type} | ${labels.required} | ${labels.description} |`,
    '| --- | --- | --- | --- |'
  )
  for (const parameter of parameters) {
    const description =
      section.descriptions[parameter.descriptionKey] ?? parameter.descriptionKey
    lines.push(
      `| \`${parameter.field}\` | ${parameter.type} | ${parameter.required ? labels.required : labels.optional} | ${description} |`
    )
  }
  if (section.footnote) lines.push('', section.footnote)
  lines.push('')
}

export function buildDocsMarkdown(input: DocsMarkdownInput): string {
  const { labels, baseUrl, siteOrigin } = input
  const origin = siteOrigin.replace(/\/$/, '')
  const lines = [
    `# ${labels.title}`,
    '',
    labels.intro,
    '',
    `## ${labels.baseUrl}`,
    '',
    fence(baseUrl),
    '',
    labels.baseUrlHint,
    '',
    `## ${labels.authentication}`,
    '',
    labels.authHint,
    '',
    fence('Authorization: Bearer sk-your-key'),
    '',
    labels.billingNote,
    '',
    `## ${labels.availableModels}`,
    '',
    `${labels.modelsHint} [${labels.modelsListLinkLabel}](${origin}/pricing)`,
    '',
    `## ${labels.endpoints}`,
    '',
  ]

  for (const group of DOCS_ENDPOINT_GROUPS) {
    if (group.titleKey) {
      lines.push(
        `### ${labels.groupTitles[group.titleKey] ?? group.titleKey}`,
        ''
      )
    }
    lines.push(
      `| ${labels.method} | ${labels.path} | ${labels.description} |`,
      '| --- | --- | --- |'
    )
    for (const endpoint of group.endpoints) {
      const description =
        labels.endpointDescriptions[endpoint.descriptionKey] ??
        endpoint.descriptionKey
      lines.push(
        `| ${endpoint.method} | \`${endpoint.path}\` | ${description} |`
      )
    }
    lines.push('')
  }

  pushParameterTable(
    lines,
    labels,
    labels.videoParameters,
    DOCS_VIDEO_PARAMETERS
  )
  pushParameterTable(
    lines,
    labels,
    labels.seedanceParameters,
    DOCS_SEEDANCE_PARAMETERS
  )

  for (const note of labels.notes) {
    lines.push(note, '')
  }
  lines.push(`## ${labels.examples}`, '')
  for (const example of input.examples) {
    lines.push(`### ${example.title}`, '', fence(example.request), '')
    if (example.response) {
      lines.push(`**${labels.response}**`, '', fence(example.response), '')
    }
  }
  lines.push(labels.furtherHelp, '')

  return lines.join('\n')
}

export function downloadMarkdownFile(markdown: string, filename: string) {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}
