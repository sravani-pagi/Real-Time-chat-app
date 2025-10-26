/** @type {import('tailwindcss').Config} */
module.exports = {
  // CRITICAL: This tells Tailwind where to find your HTML/JS files to scan for classes.
  content: [
    "./public/**/*.{html,js}", 
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}