/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        x: {
          bg: "#000000",
          hover: "#0a0a0b",
          elevated: "#16181c",
          "elevated-2": "#202327",
          primary: "#e7e9ea",
          secondary: "#8b98a5", // cool-tinted gray, does most of the work
          border: "#2f3336",
          // Disciplined 3-hue semantic system (color = meaning, ~10% of surface):
          accent: "#1d9bf0", // brand + interactive + verified + "evaluating"
          "accent-hover": "#1a8cd8",
          repost: "#00ba7c", // signal: live / connected / passed / agree / responding
          like: "#f4212e", // alert: blocked / disconnected / over-budget / disagree
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};