import type { Submission } from '../types'

/**
 * Hand-off between /capture and /review.
 *
 * The design mock stashed a base64 data URL in localStorage. A real camera frame is
 * several megabytes, which blows the ~5MB localStorage quota, so the photo lives in
 * memory instead. A hard refresh on /review therefore has nothing to submit — that
 * page redirects back to /capture, same as the mock did on an empty slot.
 */
export interface PendingPhoto {
  file: File
  /** Object URL for preview. Revoked when the next photo replaces this one. */
  previewUrl: string
  dropId: number
  /** Set once the upload comes back, so revisiting /review can't re-submit it. */
  result: Submission | null
}

let pending: PendingPhoto | null = null
let upload: Promise<Submission> | null = null

export function setPendingPhoto(next: Omit<PendingPhoto, 'result'>): void {
  if (pending) URL.revokeObjectURL(pending.previewUrl)
  pending = { ...next, result: null }
  upload = null
}

/**
 * Starts the upload exactly once and hands every caller the same promise.
 *
 * StrictMode mounts /review twice in dev; the first mount's effect is cleaned
 * up mid-flight, so the result must reach the second mount too — a ref guard
 * alone leaves the second mount with nothing to await and the spinner stuck.
 * A failed upload clears the slot so a remount can retry.
 */
export function uploadPendingOnce(run: () => Promise<Submission>): Promise<Submission> {
  if (!upload) {
    upload = run().then((result) => {
      recordPendingResult(result)
      return result
    })
    upload.catch(() => {
      upload = null
    })
  }
  return upload
}

export function getPendingPhoto(): PendingPhoto | null {
  return pending
}

export function recordPendingResult(result: Submission): void {
  if (pending) pending.result = result
}

export function clearPendingPhoto(): void {
  if (pending) URL.revokeObjectURL(pending.previewUrl)
  pending = null
  upload = null
}
