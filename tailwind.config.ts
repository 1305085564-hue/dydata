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
          canvas: "#FCFCFB",      // 极净温润暖白大底
          surface: "#F1F1F0",     // 浅砂微气垫下沉容器
          action: "#D97757",      // 暖陶土橙
          "action-hover": "#C46A4D",
          location: "#43718E",    // 暴雨灰蓝
          ink: {
            950: "#1C1917",       // 暖炭浓墨
            800: "#292524",       // 正文暖墨
            600: "#78716C",       // 辅助墨
          },
          border: {
            DEFAULT: "#E2E2DF",   // 柔和中性细边
            light: "#E2E2DF",
          },
        },
      },
      fontFamily: {
        serif: ['"Iowan Old Style"', "Charter", "Georgia", '"Songti SC"', "STSong", "SimSun", "NSimSun", "serif"],
      },
      fontWeight: {
        580: "580",
      },
      boxShadow: {
        input: "var(--shadow-input)",
        "card-ring": "var(--shadow-card-ring)",
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
