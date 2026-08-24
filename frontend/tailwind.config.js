/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0B1220',
        surface: '#131B2E',
        surfaceLight: '#1B2540',
        line: '#223049',
        textPrimary: '#E8ECF4',
        textMuted: '#8B96AC',
        recovered: '#3ECF8E',
        pending: '#F2B84B',
        escalated: '#FF6B5D'
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace']
      }
    }
  },
  plugins: []
};