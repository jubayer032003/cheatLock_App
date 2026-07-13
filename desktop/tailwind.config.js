/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          base: "#09090b",     // zinc-950
          raised: "#18181b",   // zinc-900
          overlay: "#27272a",  // zinc-800
        },
        border: {
          DEFAULT: "#27272a",
          emphasis: "#3f3f46",
        },
        accent: {
          DEFAULT: "#7c3aed",  // violet-600
          hover: "#6d28d9",    // violet-700
          muted: "rgba(124,58,237,0.12)",
        },
        success: "#22c55e",
        warning: "#eab308",
        danger: "#ef4444",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Menlo", "monospace"],
      },
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
    },
  },
  plugins: [],
}
