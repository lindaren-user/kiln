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
import { CANVAS_STORAGE_KEY } from '../constants'
import type { CanvasEdge, CanvasNode } from '../types'

export type StoredCanvas = {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

const EMPTY_CANVAS: StoredCanvas = { nodes: [], edges: [] }

// Remembers the last payload written so the mount-time save and no-op state
// updates do not re-serialize the whole canvas (including inline images).
let lastSerialized: string | null = null

export function loadCanvas(): StoredCanvas {
  try {
    const raw = window.localStorage.getItem(CANVAS_STORAGE_KEY)
    if (!raw) return EMPTY_CANVAS
    const parsed = JSON.parse(raw) as Partial<StoredCanvas>
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return EMPTY_CANVAS
    }
    lastSerialized = raw
    return { nodes: parsed.nodes, edges: parsed.edges }
  } catch {
    return EMPTY_CANVAS
  }
}

/**
 * Keep only what a restore needs. React Flow writes `selected`, `dragging`,
 * `measured` and `dimensions` onto the node objects it hands back, and the edge
 * objects carry `selected` too; serialising those made every click or resize
 * rewrite the whole canvas (inline base64 images included).
 */
function toStoredNode(node: CanvasNode): CanvasNode {
  return {
    id: node.id,
    type: node.type,
    position: node.position,
    data: node.data,
  } as CanvasNode
}

function toStoredEdge(edge: CanvasEdge): CanvasEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    animated: edge.animated,
  }
}

export function saveCanvas(canvas: StoredCanvas): void {
  try {
    const serialized = JSON.stringify({
      nodes: canvas.nodes.map(toStoredNode),
      edges: canvas.edges.map(toStoredEdge),
    })
    if (serialized === lastSerialized) return
    window.localStorage.setItem(CANVAS_STORAGE_KEY, serialized)
    lastSerialized = serialized
  } catch {
    // Inline base64 images can exceed the storage quota. The canvas keeps
    // working in memory; only persistence is skipped.
  }
}
