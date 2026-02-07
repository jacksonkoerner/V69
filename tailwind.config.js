/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './js/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        'dot-navy': '#0a1628',
        'dot-blue': '#1e3a5f',
        'dot-slate': '#334155',
        'dot-orange': '#ea580c',
        'dot-yellow': '#f59e0b',
        'dot-green': '#4a7c59',
        'safety-green': '#16a34a',
        'fv-navy': '#0a1628',
        'fv-blue': '#1e3a5f',
        'fv-slate': '#334155',
        'fv-orange': '#ff6b00',
        'fv-orange-dark': '#e55c00',
        'fv-yellow': '#f59e0b',
        'fv-green': '#16a34a',
      },
      fontFamily: {
        'display': ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
