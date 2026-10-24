/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./js/**/*.js"
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "surface-variant": "var(--color-surface-variant, #353534)",
        "on-secondary-fixed": "var(--color-on-secondary-fixed, #1a1a2e)",
        "error-container": "var(--color-error-container, #93000a)",
        "secondary-fixed": "var(--color-secondary-fixed, #e2e0fc)",
        "on-primary-fixed": "var(--color-on-primary-fixed, #001a42)",
        "inverse-primary": "var(--color-inverse-primary, #005ac2)",
        "on-primary": "var(--color-on-primary, #002e6a)",
        "primary": "var(--color-primary, #adc6ff)",
        "on-surface": "var(--color-on-surface, #e5e2e1)",
        "primary-fixed-dim": "var(--color-primary-fixed-dim, #adc6ff)",
        "on-tertiary-fixed": "var(--color-on-tertiary-fixed, #2e1500)",
        "primary-fixed": "var(--color-primary-fixed, #d8e2ff)",
        "inverse-on-surface": "var(--color-inverse-on-surface, #313030)",
        "on-secondary": "var(--color-on-secondary, #2f2e43)",
        "inverse-surface": "var(--color-inverse-surface, #e5e2e1)",
        "surface-container-low": "var(--color-surface-container-low, #1c1b1b)",
        "surface-tint": "var(--color-surface-tint, #adc6ff)",
        "on-error-container": "var(--color-on-error-container, #ffdad6)",
        "surface": "var(--color-surface, #131313)",
        "on-error": "var(--color-on-error, #690005)",
        "surface-container-lowest": "var(--color-surface-container-lowest, #0e0e0e)",
        "outline-variant": "var(--color-outline-variant, #424754)",
        "secondary-container": "var(--color-secondary-container, #47475d)",
        "on-tertiary-container": "var(--color-on-tertiary-container, #422200)",
        "on-primary-container": "var(--color-on-primary-container, #00285d)",
        "surface-container-highest": "var(--color-surface-container-highest, #353534)",
        "error": "var(--color-error, #ffb4ab)",
        "on-primary-fixed-variant": "var(--color-on-primary-fixed-variant, #004395)",
        "secondary-fixed-dim": "var(--color-secondary-fixed-dim, #c6c4df)",
        "surface-container": "var(--color-surface-container, #201f1f)",
        "on-tertiary": "var(--color-on-tertiary, #4c2700)",
        "primary-container": "var(--color-primary-container, #4d8eff)",
        "surface-dim": "var(--color-surface-dim, #131313)",
        "on-secondary-fixed-variant": "var(--color-on-secondary-fixed-variant, #45455b)",
        "on-secondary-container": "var(--color-on-secondary-container, #b8b6d0)",
        "surface-container-high": "var(--color-surface-container-high, #2a2a2a)",
        "surface-bright": "var(--color-surface-bright, #393939)",
        "background": "var(--color-background, #131313)",
        "on-background": "var(--color-on-background, #e5e2e1)",
        "secondary": "var(--color-secondary, #c6c4df)",
        "tertiary": "var(--color-tertiary, #f9ba82)",
        "tertiary-container": "var(--color-tertiary-container, #bd8552)",
        "on-tertiary-fixed-variant": "var(--color-on-tertiary-fixed-variant, #683d0f)",
        "tertiary-fixed": "var(--color-tertiary-fixed, #ffdcc1)",
        "on-surface-variant": "var(--color-on-surface-variant, #c2c6d6)",
        "outline": "var(--color-outline, #8c909f)",
        "tertiary-fixed-dim": "var(--color-tertiary-fixed-dim, #f9ba82)",
        "glass-bg-primary": "var(--glass-bg-primary)",
        "glass-bg-surface": "var(--glass-bg-surface)",
        "glass-border-light": "var(--glass-border-light)",
        "glass-shadow-elevated": "var(--glass-shadow-elevated)"
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      spacing: {
        "container-padding": "24px",
        "board-gap": "32px",
        "unit": "4px",
        "gutter-md": "16px",
        "margin-lg": "40px"
      },
      fontFamily: {
        "body-md": ["Inter"],
        "headline-lg-mobile": ["Hanken Grotesk"],
        "timer-display": ["JetBrains Mono"],
        "headline-xl": ["Hanken Grotesk"],
        "label-sm": ["JetBrains Mono"],
        "headline-lg": ["Hanken Grotesk"]
      },
      fontSize: {
        "body-md": ["16px", { "lineHeight": "24px", "fontWeight": "400" }],
        "headline-lg-mobile": ["24px", { "lineHeight": "32px", "fontWeight": "600" }],
        "timer-display": ["36px", { "lineHeight": "44px", "fontWeight": "600" }],
        "headline-xl": ["48px", { "lineHeight": "56px", "letterSpacing": "-0.02em", "fontWeight": "700" }],
        "label-sm": ["12px", { "lineHeight": "16px", "letterSpacing": "0.05em", "fontWeight": "500" }],
        "headline-lg": ["32px", { "lineHeight": "40px", "fontWeight": "600" }]
      }
    }
  },
  plugins: []
};
