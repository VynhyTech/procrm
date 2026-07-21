/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: "var(--color-background)",
          secondary: "var(--color-background-secondary)",
          tertiary: "var(--color-background-tertiary)",
        },
        foreground: {
          DEFAULT: "var(--color-foreground)",
          muted: "var(--color-foreground-muted)",
          subtle: "var(--color-foreground-subtle)",
        },
        border: {
          DEFAULT: "var(--color-border)",
          subtle: "var(--color-border-subtle)",
        },
        primary: {
          50: "var(--color-primary-50)",
          100: "var(--color-primary-100)",
          200: "var(--color-primary-200)",
          300: "var(--color-primary-300)",
          400: "var(--color-primary-400)",
          500: "var(--color-primary-500)",
          600: "var(--color-primary-600)",
          700: "var(--color-primary-700)",
          800: "var(--color-primary-800)",
          900: "var(--color-primary-900)",
          950: "var(--color-primary-950)",
          accent: "var(--color-primary-accent)",
          text: "var(--color-primary-text)",
        },
        info: {
          50: "var(--color-info-50)", 100: "var(--color-info-100)", 200: "var(--color-info-200)",
          300: "var(--color-info-300)", 400: "var(--color-info-400)", 500: "var(--color-info-500)",
          600: "var(--color-info-600)", 700: "var(--color-info-700)", 800: "var(--color-info-800)",
          900: "var(--color-info-900)", 950: "var(--color-info-950)",
        },
        success: {
          50: "var(--color-success-50)", 100: "var(--color-success-100)", 200: "var(--color-success-200)",
          300: "var(--color-success-300)", 400: "var(--color-success-400)", 500: "var(--color-success-500)",
          600: "var(--color-success-600)", 700: "var(--color-success-700)", 800: "var(--color-success-800)",
          900: "var(--color-success-900)", 950: "var(--color-success-950)",
        },
        warning: {
          50: "var(--color-warning-50)", 100: "var(--color-warning-100)", 200: "var(--color-warning-200)",
          300: "var(--color-warning-300)", 400: "var(--color-warning-400)", 500: "var(--color-warning-500)",
          600: "var(--color-warning-600)", 700: "var(--color-warning-700)", 800: "var(--color-warning-800)",
          900: "var(--color-warning-900)", 950: "var(--color-warning-950)",
        },
        error: {
          50: "var(--color-error-50)", 100: "var(--color-error-100)", 200: "var(--color-error-200)",
          300: "var(--color-error-300)", 400: "var(--color-error-400)", 500: "var(--color-error-500)",
          600: "var(--color-error-600)", 700: "var(--color-error-700)", 800: "var(--color-error-800)",
          900: "var(--color-error-900)", 950: "var(--color-error-950)",
        },
        accent: {
          50: "var(--color-accent-50)", 100: "var(--color-accent-100)", 200: "var(--color-accent-200)",
          300: "var(--color-accent-300)", 400: "var(--color-accent-400)", 500: "var(--color-accent-500)",
          600: "var(--color-accent-600)", 700: "var(--color-accent-700)", 800: "var(--color-accent-800)",
          900: "var(--color-accent-900)", 950: "var(--color-accent-950)",
        },
        modal: {
          background: "var(--color-modal-background)",
          overlay: "var(--color-modal-overlay)",
          border: "var(--color-modal-border)",
        },
        button: {
          "primary-bg": "var(--color-button-primary-bg)",
          "primary-hover": "var(--color-button-primary-hover)",
          "primary-text": "var(--color-button-primary-text)",
          "secondary-bg": "var(--color-button-secondary-bg)",
          "secondary-hover": "var(--color-button-secondary-hover)",
          "secondary-text": "var(--color-button-secondary-text)",
          "destructive-bg": "var(--color-button-destructive-bg)",
          "destructive-hover": "var(--color-button-destructive-hover)",
          "destructive-text": "var(--color-button-destructive-text)",
          "outline-border": "var(--color-button-outline-border)",
          "outline-hover": "var(--color-button-outline-hover)",
          "outline-text": "var(--color-button-outline-text)",
          "ghost-bg": "var(--color-button-ghost-bg)",
          "ghost-hover": "var(--color-button-ghost-hover)",
          "ghost-text": "var(--color-button-ghost-text)",
        },
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      zIndex: {
        modal: "50",
        "modal-backdrop": "40",
      },
      boxShadow: {
        modal: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
        card: "0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
      },
      keyframes: {
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "scale-in": "scale-in 0.15s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
