//src/tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  theme: {
    extend: {
      colors: {
        primary: {
          500: '#22c55e' // Verifica contraste con fondo blanco (pasa WCAG AA)
        }
      }
    }
  },
  plugins: []
};