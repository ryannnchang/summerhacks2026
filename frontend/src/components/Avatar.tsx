const SIZES = {
  sm: 'w-8 h-8 text-base rounded-md',
  md: 'w-10 h-10 text-lg rounded-lg',
  lg: 'w-11 h-11 text-lg rounded-lg',
} as const

/** Initial-in-a-turf-square, shared by the feed, the leaderboard and the member list. */
export function Avatar({ name, size = 'md' }: { name: string; size?: keyof typeof SIZES }) {
  return (
    <span
      aria-hidden
      className={`${SIZES[size]} flex-shrink-0 bg-gradient-to-br from-turf-500 to-turf-700 flex items-center justify-center font-display text-chalk`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}
