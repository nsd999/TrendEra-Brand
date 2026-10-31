import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: "#050505",
          panel: "#0d0d0d",
          card: "#121212",
          cardHover: "#181818",
          line: "#292929",
          muted: "#a4a4a4",
          white: "#f7f7f7",
        },
      },
    },
  },
  plugins: [],
};

export default config;

