import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        dashboard: {
          primary: "#5B5FEF",
          secondary: "#1E2A78",
          bg: "#F5F7FB",
          surface: "#FFFFFF",
          border: "#E6E9F0",
          text: {
            primary: "#1A1D2E",
            secondary: "#6B7280",
            muted: "#9CA3AF",
          },
          sidebar: {
            DEFAULT: "#E5E7EB",
            item: "#D1D5DB",
            active: "#5B5FEF",
            text: "#1A1D2E",
          },
          status: {
            success: "#22C55E",
            warning: "#F59E0B",
            danger: "#EF4444",
            info: "#3B82F6",
          },
          timeline: {
            blue: "#2D7FF9",
            purple: "#6D5EF6",
            lightPurple: "#B8B3F6",
            teal: "#14B8A6",
          },
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        "dashboard-xs": ["12px", { lineHeight: "1.5" }],
        "dashboard-sm": ["13px", { lineHeight: "1.5" }],
        "dashboard-base": ["14px", { lineHeight: "1.5" }],
        "dashboard-md": ["16px", { lineHeight: "1.5" }],
        "dashboard-lg": ["18px", { lineHeight: "1.4" }],
        "dashboard-xl": ["22px", { lineHeight: "1.3" }],
      },
      spacing: {
        "dashboard-xs": "4px",
        "dashboard-sm": "8px",
        "dashboard-md": "12px",
        "dashboard-lg": "16px",
        "dashboard-xl": "24px",
        "dashboard-xxl": "32px",
      },
      borderRadius: {
        "dashboard-sm": "8px",
        "dashboard-md": "12px",
        "dashboard-lg": "16px",
        "dashboard-xl": "20px",
      },
      boxShadow: {
        "dashboard-card": "0px 4px 20px rgba(0,0,0,0.05)",
        "dashboard-hover": "0px 8px 30px rgba(0,0,0,0.08)",
      },
      transitionDuration: {
        "dashboard-fast": "150ms",
        "dashboard-normal": "250ms",
        "dashboard-slow": "350ms",
      },
      transitionTimingFunction: {
        dashboard: "ease",
      },
      width: {
        sidebar: "260px",
        "sidebar-collapsed": "80px",
        "timeline-col": "80px",
      },
      minWidth: {
        "timeline-col": "80px",
      },
      height: {
        "header-dashboard": "72px",
        "sidebar-item": "48px",
        "event-row": "56px",
        "timeline-bar": "28px",
      },
      maxWidth: {
        "event-panel": "420px",
      },
    },
  },
  plugins: [],
};
export default config;
