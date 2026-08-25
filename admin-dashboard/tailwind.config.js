/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cyan: {
          50: "#f5f3ff",
          100: "#ede9fe",
          200: "#ddd6fe",
          300: "#c4b5fd",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
          700: "#6d28d9",
          800: "#5b21b6",
          900: "#4c1d95",
          950: "#2e1065",
        },
        command: {
          50: "#f0f4fa",
          100: "#e1e9f5",
          200: "#c8d7eb",
          300: "#a3bce0",
          400: "#779cd0",
          500: "#557dbf",
          600: "#4163aa",
          700: "#365192",
          800: "#1e2d53",
          900: "#16213e",
          950: "#0b0f19",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(139, 92, 246, 0.18), 0 18px 50px rgba(15, 23, 42, 0.22)",
      },
    },
  },
  plugins: [],
};
