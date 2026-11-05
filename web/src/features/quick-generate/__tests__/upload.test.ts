import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { uploadQuickGenerateReferences } from '../api'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const apiMock = vi.mocked(api)

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('uploadQuickGenerateReferences', () => {
  it('uploads once using a signed URL when the digest is not stored', async () => {
    const blob = new Blob(['image bytes'], { type: 'image/png' })
    const blobURL = URL.createObjectURL(blob)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, blob: async () => blob })
      .mockResolvedValueOnce({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { enabled: true } },
    } as never)
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          exists: false,
          url: 'https://bucket.r2.example/read?signature=read',
          put_url: 'https://bucket.r2.example/put?signature=put',
          headers: { 'Content-Type': 'image/png' },
        },
      },
    } as never)

    await expect(
      uploadQuickGenerateReferences([{ url: blobURL, mediaType: 'image/png' }])
    ).resolves.toEqual([
      {
        url: 'https://bucket.r2.example/read?signature=read',
        mediaType: 'image/png',
      },
    ])
    expect(apiMock.post).toHaveBeenCalledWith(
      '/api/quick-generate/upload',
      expect.objectContaining({ content_type: 'image/png', size: 11 })
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://bucket.r2.example/put?signature=put'
    )
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'PUT',
      body: blob,
    })
    URL.revokeObjectURL(blobURL)
  })

  it('uses a previously stored object without uploading', async () => {
    const blobURL = URL.createObjectURL(
      new Blob(['same image'], { type: 'image/png' })
    )
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['same image'], { type: 'image/png' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { enabled: true } },
    } as never)
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          exists: true,
          url: 'https://bucket.r2.example/read?signature=read',
        },
      },
    } as never)

    await expect(
      uploadQuickGenerateReferences([{ url: blobURL, mediaType: 'image/png' }])
    ).resolves.toEqual([
      {
        url: 'https://bucket.r2.example/read?signature=read',
        mediaType: 'image/png',
      },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('requires temporary file storage when a reference is selected', async () => {
    const blobURL = URL.createObjectURL(
      new Blob(['image bytes'], { type: 'image/png' })
    )
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['image bytes'], { type: 'image/png' }),
      })
    )
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { enabled: false } },
    } as never)

    await expect(
      uploadQuickGenerateReferences([{ url: blobURL, mediaType: 'image/png' }])
    ).rejects.toThrow('Temporary file storage is not configured')
  })

  it('uploads a large video in parts and completes the multipart upload', async () => {
    const partSize = 10 * 1024 * 1024
    const blob = new Blob([new Uint8Array(partSize * 3)], { type: 'video/mp4' })
    const blobURL = URL.createObjectURL(blob)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, blob: async () => blob })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => '"etag-1"' },
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => '"etag-2"' },
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => '"etag-3"' },
      })
    vi.stubGlobal('fetch', fetchMock)
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { enabled: true, multipart_enabled: true } },
    } as never)
    apiMock.post.mockImplementation((async (
      url: string,
      body: Record<string, unknown>
    ) => {
      if (url === '/api/quick-generate/upload/multipart') {
        return {
          data: {
            success: true,
            data: {
              key: 'quick-generate/digest',
              upload_id: 'upload-1',
              part_size: partSize,
              parts: [
                { part_number: 1, url: 'https://bucket.r2.example/part-1' },
                { part_number: 2, url: 'https://bucket.r2.example/part-2' },
                { part_number: 3, url: 'https://bucket.r2.example/part-3' },
              ],
            },
          },
        }
      }
      return {
        data: {
          success: true,
          data: {
            url: `https://bucket.r2.example/read?body=${JSON.stringify(body)}`,
          },
        },
      }
    }) as never)

    await expect(
      uploadQuickGenerateReferences([{ url: blobURL, mediaType: 'video/mp4' }])
    ).resolves.toEqual([
      expect.objectContaining({
        mediaType: 'video/mp4',
        url: expect.stringContaining('https://bucket.r2.example/read?body='),
      }),
    ])

    expect(apiMock.post).toHaveBeenCalledWith(
      '/api/quick-generate/upload/multipart/complete',
      expect.objectContaining({
        key: 'quick-generate/digest',
        upload_id: 'upload-1',
        parts: [
          { part_number: 1, etag: '"etag-1"' },
          { part_number: 2, etag: '"etag-2"' },
          { part_number: 3, etag: '"etag-3"' },
        ],
      })
    )
    expect(apiMock.post).not.toHaveBeenCalledWith(
      '/api/quick-generate/upload',
      expect.anything()
    )
    URL.revokeObjectURL(blobURL)
  })

  it('reports uploaded references so the composer can show a spinner', async () => {
    const blob = new Blob(['image bytes'], { type: 'image/png' })
    const blobURL = URL.createObjectURL(blob)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, blob: async () => blob })
        .mockResolvedValueOnce({ ok: true })
    )
    apiMock.get.mockResolvedValue({
      data: { success: true, data: { enabled: true } },
    } as never)
    apiMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          exists: true,
          url: 'https://bucket.r2.example/read?signature=read',
        },
      },
    } as never)
    const onProgress = vi.fn()

    await uploadQuickGenerateReferences(
      [{ url: blobURL, mediaType: 'image/png' }],
      onProgress
    )

    expect(onProgress).toHaveBeenLastCalledWith(1, 1)
    URL.revokeObjectURL(blobURL)
  })
})
