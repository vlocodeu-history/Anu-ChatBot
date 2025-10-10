/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html","./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50:"#e7fff3",100:"#c2ffe1",200:"#8bffd0",300:"#4ef3b5",
          400:"#25d39a",500:"#11b480",600:"#0a8f66",700:"#0b7354",800:"#0d5a45",900:"#0d4a38",
        },
        chat: { me:"#d9fdd3", them:"#ffffff", bg:"#efeae2", pane:"#f7f7f7" },
      },
      boxShadow: { header: "0 1px 0 rgba(0,0,0,.06)" },
    },
  },
  plugins: [],
};
