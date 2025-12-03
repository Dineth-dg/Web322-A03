/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./views/**/*.ejs"],
  themes: ['cupcake'],
   plugins: [require('@tailwindcss/typography'), require('daisyui')],
}

