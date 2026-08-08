import { useNavigate } from 'react-router-dom'

interface Props {
  /** Shown under the headline — the live drop's state, usually. */
  hint: string
  disabled?: boolean
}

export function TouchGrassButton({ hint, disabled }: Props) {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate('/capture')}
      disabled={disabled}
      className="group relative w-full rounded-2xl bg-scoreboard disabled:bg-scoreboard/30 disabled:cursor-not-allowed text-turf-900 py-6 px-6 flex items-center justify-between overflow-hidden chalk-border-solid shadow-lg enabled:active:scale-[0.98] transition-transform"
    >
      <div className="absolute inset-0 bg-turf-900/0 group-enabled:group-hover:bg-turf-900/5 transition-colors" />
      <div className="text-left relative">
        <p className="font-display text-3xl leading-none tracking-wide">TOUCH GRASS NOW</p>
        <p className="text-sm text-turf-900/70 mt-1">{hint}</p>
      </div>
      <div className="relative w-12 h-12 rounded-full bg-turf-900 flex items-center justify-center flex-shrink-0 ml-3">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#FFB627"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-6 h-6"
          aria-hidden
        >
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </div>
    </button>
  )
}
