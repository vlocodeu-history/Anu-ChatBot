/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx}",
    "./src/components/**/*.{ts,tsx,js,jsx}",
    "./src/pages/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Metronic v5-ish teal
        brand: {
          50:  "#ecfef8",
          100: "#d1fbf1",
          200: "#a7f5e6",
          300: "#75e7d6",
          400: "#41d4c4",
          500: "#1BC5BD",  // ← primary
          600: "#14a7a7",
          700: "#128b8d",
          800: "#126f72",
          900: "#105a5e",
        },

        // semantic aliases (optional)
        primary: {
          DEFAULT: "#1BC5BD",
          50:"#ecfef8",100:"#d1fbf1",200:"#a7f5e6",300:"#75e7d6",400:"#41d4c4",
          500:"#1BC5BD",600:"#14a7a7",700:"#128b8d",800:"#126f72",900:"#105a5e",
        },

        chat: { me:"#d9fdd3", them:"#ffffff", bg:"#efeae2", pane:"#f7f7f7" },
      },

      boxShadow: {
        header: "0 1px 0 rgba(0,0,0,.06)"
      },

      borderRadius: {
        xl2: "1.25rem" // slightly rounder, Metronic feel
      }
    },
  },
  plugins: [],
};
