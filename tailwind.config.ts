import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0fbff',
          100: '#bee5f0',
          200: '#7acfe6',
          300: '#2abbd5',
          400: '#2288c9',
          500: '#2288c9',
          600: '#1a6fa8',
          700: '#182c3f',
          800: '#0d1a2a',
          900: '#080f18',
        },
      },
      boxShadow: {
        'brand':    '0 4px 24px 0 rgba(34,136,201,0.18)',
        'brand-lg': '0 8px 40px 0 rgba(34,136,201,0.28)',
        'card':     '0 2px 12px 0 rgba(13,26,42,0.08)',
      },
    },
  },
  plugins: [],
}
export default config
