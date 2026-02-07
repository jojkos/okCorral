/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        western: {
          sand: '#D4A853',
          leather: '#8B4513',
          rust: '#B7410E',
          wood: '#654321',
          cream: '#FFF8DC',
        },
        sheriff: {
          primary: '#3B82F6',
          dark: '#1E40AF',
        },
        outlaw: {
          primary: '#EF4444',
          dark: '#B91C1C',
        },
      },
      animation: {
        'bullet-fly': 'bulletFly 0.3s ease-out forwards',
        'hit-flash': 'hitFlash 0.2s ease-out',
        'barrel-shake': 'barrelShake 0.3s ease-out',
      },
      keyframes: {
        bulletFly: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(var(--bullet-distance))' },
        },
        hitFlash: {
          '0%, 100%': { filter: 'brightness(1)' },
          '50%': { filter: 'brightness(2)' },
        },
        barrelShake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-5px)' },
          '75%': { transform: 'translateX(5px)' },
        },
      },
    },
  },
  plugins: [],
}
