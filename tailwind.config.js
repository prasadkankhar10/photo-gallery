/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0f',
        surface: 'rgba(255, 255, 255, 0.05)',
        primary: '#3b82f6',
        primaryGlow: 'rgba(59, 130, 246, 0.5)'
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
