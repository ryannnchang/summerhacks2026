import { useEffect, useRef, useState } from 'react'

interface Props {
  /** Receives a real `File`, because that is what the upload endpoint takes. */
  onCapture: (file: File) => void
  disabled?: boolean
}

export function CameraCapture({ onCapture, disabled }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera not supported on this device.')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setCameraReady(true)
      } catch {
        setCameraError("Couldn't reach the camera. Use the upload option below instead.")
      }
    }

    void startCamera()

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function handleSnap() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(new File([blob], 'grass.jpg', { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.9,
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden chalk-border-solid bg-turf-800">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`w-full h-full object-cover ${cameraReady ? 'opacity-100' : 'opacity-0'}`}
        />
        {!cameraReady && !cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-chalk/60">
            <div className="w-8 h-8 border-2 border-scoreboard border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-mono">warming up the lens…</p>
          </div>
        )}
        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6 text-chalk/70">
            <p className="text-sm">{cameraError}</p>
          </div>
        )}

        {/* corner frame marks, like a field-goal viewfinder */}
        <div className="pointer-events-none absolute inset-4 border-2 border-scoreboard/40 rounded-xl" />
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <div className="flex flex-col w-full gap-2.5">
        <button
          onClick={handleSnap}
          disabled={!cameraReady || disabled}
          className="w-full bg-scoreboard disabled:bg-scoreboard/30 disabled:cursor-not-allowed hover:bg-scoreboard-dim text-turf-900 font-display text-2xl tracking-wide py-3 rounded-xl transition-colors"
        >
          SNAP PHOTO
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="w-full text-chalk/70 text-sm py-2 border border-chalk/20 rounded-xl hover:text-chalk hover:border-chalk/40 disabled:opacity-50 transition-colors"
        >
          Upload a photo instead
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onCapture(file)
            e.target.value = ''
          }}
          className="hidden"
        />
      </div>
    </div>
  )
}
