import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        bg: '#f5f9ff',
        panel: '#ffffff',
        border: '#e2e8f0',
        'border-strong': '#cbd5e1',
        text: '#0f172a',
        'text-2': '#334155',
        muted: '#64748b',
        navy: '#1a2b4a',
        cream: '#f8f3ed',
        'good-bg': '#e6f4ec',
        accent: {
          DEFAULT: '#2b88ca',
          50: '#eaf3fb',
          600: '#2276b4',
          700: '#1c5f94',
        },
        orange: {
          DEFAULT: '#f58645',
          50: '#fdebdd',
          600: '#e67333',
        },
        good: '#058e6e',
        bad: '#d92d20',
        warn: '#e67333',
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(15, 23, 42, 0.04)',
        md: '0 6px 20px -8px rgba(30, 80, 140, 0.18), 0 2px 6px -2px rgba(15, 23, 42, 0.06)',
        card: '0 10px 30px rgba(26, 43, 74, 0.10)',
        'card-sm': '0 4px 14px rgba(26, 43, 74, 0.07)',
      },
      fontFamily: {
        sans: ['Poppins', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
