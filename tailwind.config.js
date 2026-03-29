/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif']
      },
      colors: {
        brand: {
          100: '#ffe4ea',
          200: '#fecdd6',
          300: '#fda4b4',
          400: '#fb7185',
          500: '#f43f5e'
        }
      },
      boxShadow: {
        glow: '0 20px 50px rgba(251, 113, 133, 0.25)'
      }
    },
  },
  plugins: [],
}
