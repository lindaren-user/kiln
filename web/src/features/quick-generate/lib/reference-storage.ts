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

/**
 * Reference media cannot live in localStorage: the composer takes files up to
 * 100 MB, while localStorage holds a few megabytes of text. IndexedDB stores
 * the blobs, so the composer can put them back after a reload.
 */
const DATABASE_NAME = 'kiln-quick-generate'
const STORE_NAME = 'references'
const RECORD_KEY = 'current'

type StoredReference = {
  filename: string
  mediaType: string
  blob: Blob
}

type ReferenceFile = {
  url: string
  filename?: string
  mediaType?: string
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.addEventListener('upgradeneeded', () => {
      request.result.createObjectStore(STORE_NAME)
    })
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => reject(request.error))
  })
}

/** Storage is missing in tests and when a browser blocks site data. */
function storageAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

/**
 * A save first reads every file, so an older, slower save could otherwise
 * finish last and leave stale references behind. Saves run one at a time.
 */
let pendingSave: Promise<void> = Promise.resolve()

/** Stores the current reference set, replacing the previous one. */
export function saveReferenceFiles(files: ReferenceFile[]): Promise<void> {
  if (!storageAvailable()) return Promise.resolve()
  const save = pendingSave.then(async () => {
    const stored: StoredReference[] = []
    for (const file of files) {
      const response = await fetch(file.url)
      if (!response.ok) continue
      const blob = await response.blob()
      stored.push({
        filename: file.filename || 'reference',
        mediaType: file.mediaType || blob.type,
        blob,
      })
    }
    const database = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      store.clear()
      if (stored.length > 0) store.put(stored, RECORD_KEY)
      transaction.addEventListener('complete', () => resolve())
      transaction.addEventListener('error', () => reject(transaction.error))
      transaction.addEventListener('abort', () => reject(transaction.error))
    })
    database.close()
  })
  // A failed save (quota, private mode) must not poison the next one.
  pendingSave = save.catch(() => undefined)
  return save
}

/** The reference files of the previous visit, in the order they were added. */
export async function loadReferenceFiles(): Promise<File[]> {
  if (!storageAvailable()) return []
  const database = await openDatabase()
  try {
    const stored = await new Promise<StoredReference[]>((resolve, reject) => {
      const request = database
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(RECORD_KEY)
      request.addEventListener('success', () =>
        resolve(Array.isArray(request.result) ? request.result : [])
      )
      request.addEventListener('error', () => reject(request.error))
    })
    return stored
      .filter((item) => item.blob instanceof Blob)
      .map(
        (item) =>
          new File([item.blob], item.filename, { type: item.mediaType })
      )
  } finally {
    database.close()
  }
}
