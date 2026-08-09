/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        turf: {
          900: '#16290F',
          800: '#1F3D1A',
          700: '#2D5A27',
          600: '#3B6E33',
          500: '#4A7C3C',
          400: '#6B9955',
          300: '#8CB878', // a step lighter than 400 — the map card's fill
        },
        chalk: '#F5F1E4',
        // The page's sky gradient, as named colours so cards can sit in it.
        sky: {
          DEFAULT: '#3D7DB8',
          deep: '#2C5F95',
          pale: '#5B9BCE',
        },
        scoreboard: {
          DEFAULT: '#FFB627',
          dim: '#B5822A',
        },
        dirt: {
          DEFAULT: '#6B4226',
          light: '#8A5A34',
        },
      },
      fontFamily: {
        display: ['var(--font-bebas)', 'sans-serif'],
        body: ['var(--font-worksans)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      backgroundImage: {
        'turf-stripes':
          'repeating-linear-gradient(180deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 40px, transparent 40px, transparent 80px)',
      },
      keyframes: {
        flipdown: {
          '0%': { transform: 'rotateX(0deg)' },
          '50%': { transform: 'rotateX(-90deg)' },
          '100%': { transform: 'rotateX(0deg)' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        popin: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        shutter: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
      },
      animation: {
        flipdown: 'flipdown 0.5s ease-in-out',
        scanline: 'scanline 1.8s linear infinite',
        popin: 'popin 0.25s ease-out',
        marquee: 'marquee 12s linear infinite',
        shutter: 'shutter 0.35s ease-out forwards',
      },
    },
  },
  plugins: [],
}
