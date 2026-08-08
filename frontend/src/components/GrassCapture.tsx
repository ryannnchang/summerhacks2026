import { useRef, useState } from 'react'

import { api } from '../api/client'
import type { Submission } from '../types'

interface Props {
  groupId: number
  dropId: number
  disabled?: boolean
  onSubmitted: (submission: Submission) => void
}

export function GrassCapture({ groupId, dropId, disabled, onSubmitted }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Submission | null>(null)

  async function handleFile(file: File) {
    setError(null)
    setResult(null)
    setPreview(URL.createObjectURL(file))
    setBusy(true)
    try {
      const submission = await api.submitGrass(groupId, dropId, file)
      setResult(submission)
      onSubmitted(submission)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="capture card">
      <h2 className="card__title">Prove it</h2>
      <p className="card__hint">
        Find real grass, get close, fill the frame. Turf and screens get rejected.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
          e.target.value = ''
        }}
      />

      {preview && <img className="capture__preview" src={preview} alt="Your grass submission" />}

      <button
        className="button button--primary"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
      >
        {busy ? 'Verifying grass…' : preview ? 'Retake' : '📸 Touch grass'}
      </button>

      {error && <p className="alert alert--error">{error}</p>}

      {result?.status === 'verified' && (
        <div className="alert alert--success">
          <strong>Verified grass. +{result.total_score} pts</strong>
          <dl className="score-breakdown">
            <div>
              <dt>Quality</dt>
              <dd>{result.quality_score.toFixed(0)}</dd>
            </div>
            <div>
              <dt>Speed</dt>
              <dd>{result.speed_score.toFixed(0)}</dd>
            </div>
            <div>
              <dt>Coverage</dt>
              <dd>{(result.grass_coverage * 100).toFixed(0)}%</dd>
            </div>
            <div>
              <dt>Response</dt>
              <dd>{result.response_seconds.toFixed(0)}s</dd>
            </div>
          </dl>
        </div>
      )}

      {result?.status === 'rejected' && (
        <p className="alert alert--error">
          <strong>Rejected.</strong> {result.reject_reason}
        </p>
      )}
    </section>
  )
}
