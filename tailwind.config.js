/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: '#fdfbf7',
        ink: '#2c2e33',
        pencil: '#5c5f66',
        primary: '#3b82f6',
        highlight: '#fde047',
        errorInk: '#e11d48',
        successInk: '#16a34a'
      },
      fontFamily: {
        sketch: ['"Patrick Hand"', 'cursive'],
        mono: ['"Space Mono"', 'monospace']
      },
      boxShadow: {
        sketch: '4px 4px 0px rgba(44, 46, 51, 1)',
        sketchHover: '2px 2px 0px rgba(44, 46, 51, 1)'
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(100%)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        }
      },
      animation: {
        'slide-up': 'slideUp 0.3s ease-out forwards',
      }
    },
  },
  plugins: [],
}
