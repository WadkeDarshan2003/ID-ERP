/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      scrollbar: {
        thin: 'thin',
        none: 'none'
      }
    }
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        '.scrollbar-hide': {
          '-ms-overflow-style': 'none',
          'scrollbar-width': 'none',
          '&::-webkit-scrollbar': {
            display: 'none'
          }
        },
        '.scrollbar-show': {
          '-ms-overflow-style': 'auto',
          'scrollbar-width': 'thin',
          '&::-webkit-scrollbar': {
            width: '6px'
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent'
          },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(107, 114, 128, 0.5)',
            borderRadius: '3px'
          },
          '&::-webkit-scrollbar-thumb:hover': {
            background: 'rgba(107, 114, 128, 0.7)'
          }
        },
        '.scrollbar-thin': {
          'scrollbar-width': 'thin',
          '&::-webkit-scrollbar': {
            width: '6px'
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent'
          },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(107, 114, 128, 0.4)',
            borderRadius: '3px'
          },
          '&::-webkit-scrollbar-thumb:hover': {
            background: 'rgba(107, 114, 128, 0.6)'
          }
        }
      })
    }
  ]
}
