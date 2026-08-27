import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        claude: {
          canvas: "#FBF9F5",      // 温润象牙暖纸底
          surface: "#F5F3EE",     // 极浅砂岩微气垫
          action: "#D97757",      // 暖陶土橙
          "action-hover": "#C46A4D",
          location: "#43718E",    // 暴雨灰蓝
          ink: {
            950: "#1C1917",       // 暖炭浓墨
            800: "#292524",       // 正文暖墨
            600: "#78716C",       // 辅助墨
          },
          border: {
            DEFAULT: "#E5E0D6",   // 暖砂岩细边
            light: "#ECE7DE",
          },
        },
      },
      fontFamily: {
        serif: ['"Iowan Old Style"', "Charter", "Georgia", '"Songti SC"', "STSong", "SimSun", "NSimSun", "serif"],
      },
      boxShadow: {
        "claude-float": "var(--shadow-claude-float)",
        "claude-dialog": "var(--shadow-claude-dialog)",
      },
      animation: {
        "pulse-claude": "pulse-claude 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in-up": "fade-in-up 120ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
      },
      keyframes: {
        "pulse-claude": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        "fade-in-up": {
          "from": { opacity: "0", transform: "translateY(2px)" },
          "to": { opacity: "1", transform: "translateY(0)" },
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
export default config;
