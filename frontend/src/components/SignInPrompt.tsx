import { useSession } from '../hooks/useSession'

interface Props {
  title: string
  body: string
  /** Where to land after Google sends the visitor back. */
  returnTo?: string
}

/** Used wherever a signed-out visitor hits something that needs an account. */
export function SignInPrompt({ title, body, returnTo }: Props) {
  const { signInWithGoogle, error } = useSession()

  return (
    <div className="bg-turf-800/60 chalk-border rounded-2xl p-5 flex flex-col gap-3">
      <div>
        <p className="font-display text-2xl tracking-wide text-chalk leading-none">{title}</p>
        <p className="text-chalk/60 text-sm mt-1">{body}</p>
      </div>

      <button
        onClick={() => void signInWithGoogle(returnTo)}
        className="w-full bg-chalk hover:bg-white text-turf-900 font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-3"
      >
        <svg viewBox="0 0 48 48" className="w-5 h-5 flex-shrink-0" aria-hidden>
          <path
            fill="#4285F4"
            d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
          />
          <path
            fill="#34A853"
            d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
          />
          <path
            fill="#FBBC05"
            d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
          />
          <path
            fill="#EA4335"
            d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
          />
        </svg>
        Continue with Google
      </button>

      {error && (
        <p className="text-dirt-light text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
