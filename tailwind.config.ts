import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(0, 0, 0, 0.37), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)",
        "glass-lg": "0 12px 48px 0 rgba(0, 0, 0, 0.5), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)",
        "glass-sm": "0 4px 16px 0 rgba(0, 0, 0, 0.25), inset 0 1px 0 0 rgba(255, 255, 255, 0.03)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-4px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
        meteor: {
          "0%": { transform: "translateY(-20%) translateX(0) rotate(215deg)", opacity: "0" },
          "5%": { opacity: "1" },
          "95%": { opacity: "1" },
          "100%": { transform: "translateY(300%) translateX(-200px) rotate(215deg)", opacity: "0" },
        },
        "stagger-in": {
          from: { opacity: "0", transform: "translateY(12px) scale(0.98)", filter: "blur(2px)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)", filter: "blur(0)" },
        },
        "gradient-shift": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "orb-float-1": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "25%": { transform: "translate(30px, -20px) scale(1.05)" },
          "50%": { transform: "translate(-10px, 20px) scale(0.95)" },
          "75%": { transform: "translate(-30px, -10px) scale(1.02)" },
        },
        "orb-float-2": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "25%": { transform: "translate(-20px, 30px) scale(0.98)" },
          "50%": { transform: "translate(25px, -15px) scale(1.04)" },
          "75%": { transform: "translate(15px, 25px) scale(0.97)" },
        },
        "orb-float-3": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(-25px, -20px) scale(1.03)" },
          "66%": { transform: "translate(20px, 15px) scale(0.96)" },
        },
        "subtle-pulse": {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 2s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.5s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        meteor: "meteor 5s linear infinite",
        "stagger-in": "stagger-in 0.5s cubic-bezier(0.4,0,0.2,1) forwards",
        "gradient-shift": "gradient-shift 8s ease infinite",
        "orb-1": "orb-float-1 20s ease-in-out infinite",
        "orb-2": "orb-float-2 25s ease-in-out infinite",
        "orb-3": "orb-float-3 18s ease-in-out infinite",
        "subtle-pulse": "subtle-pulse 3s ease-in-out infinite",
      },
    },
  },
};

export default config;
