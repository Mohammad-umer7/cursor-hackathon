import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        ink: {
          950: "#070a0f",
          900: "#0b0f16",
          800: "#0f141d",
          700: "#161d29",
          600: "#2a3445",
        },
        accent: {
          DEFAULT: "#3ddc97",
          dim: "#1f8f63",
        },
        gap: {
          bad: "#ef4444",
          mid: "#f59e0b",
          good: "#22c55e",
        },
      },
      boxShadow: {
        float: "0 12px 40px -12px rgba(0,0,0,0.7), 0 2px 8px -2px rgba(0,0,0,0.5)",
        glow: "0 0 0 1px rgba(61,220,151,0.25), 0 0 24px -4px rgba(61,220,151,0.4)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        ripple: {
          "0%": { transform: "scale(0.6)", opacity: "0.8" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s linear infinite",
        ripple: "ripple 1.8s ease-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
