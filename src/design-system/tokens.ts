/**
 * Design system tokens — mirrors the authoritative JSON (single source of truth).
 * Use Tailwind classes mapped to these values; import for TS-only needs (e.g. charts).
 */

export const tokens = {
  colors: {
    primary: "#5B5FEF",
    primaryGradient: ["#5B5FEF", "#6D72F6"] as const,
    secondary: "#1E2A78",
    background: "#F5F7FB",
    surface: "#FFFFFF",
    border: "#E6E9F0",
    text: {
      primary: "#1A1D2E",
      secondary: "#6B7280",
      muted: "#9CA3AF",
    },
    sidebar: {
      bg: "#0B1454",
      item: "#1A2B8F",
      active: "#2D3FD8",
      text: "#FFFFFF",
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
  typography: {
    fontFamily: "Inter, sans-serif",
    sizes: {
      xs: "12px",
      sm: "13px",
      base: "14px",
      md: "16px",
      lg: "18px",
      xl: "22px",
    },
    weights: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
  },
  shadow: {
    card: "0px 4px 20px rgba(0,0,0,0.05)",
    hover: "0px 8px 30px rgba(0,0,0,0.08)",
  },
  layout: {
    sidebarWidth: 260,
    sidebarCollapsedWidth: 80,
    headerHeight: 72,
    contentPadding: 24,
  },
  components: {
    sidebarItem: { height: 48, iconSize: 20 },
    eventRow: { height: 56 },
    timeline: {
      barHeight: 28,
      columnWidth: 80,
    },
    avatar: { size: 32 },
  },
  animation: {
    fast: "150ms ease",
    normal: "250ms ease",
    slow: "350ms ease",
  },
} as const;

export type TimelineAccent = keyof typeof tokens.colors.timeline;
