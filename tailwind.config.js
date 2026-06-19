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
        "surface-variant": "#353534",
        "on-secondary-fixed": "#1a1a2e",
        "error-container": "#93000a",
        "secondary-fixed": "#e2e0fc",
        "on-primary-fixed": "#001a42",
        "inverse-primary": "#005ac2",
        "on-primary": "#002e6a",
        "primary": "#adc6ff",
        "on-surface": "#e5e2e1",
        "primary-fixed-dim": "#adc6ff",
        "on-tertiary-fixed": "#2e1500",
        "primary-fixed": "#d8e2ff",
        "inverse-on-surface": "#313030",
        "on-secondary": "#2f2e43",
        "inverse-surface": "#e5e2e1",
        "surface-container-low": "#1c1b1b",
        "surface-tint": "#adc6ff",
        "on-error-container": "#ffdad6",
        "surface": "#131313",
        "on-error": "#690005",
        "surface-container-lowest": "#0e0e0e",
        "outline-variant": "#424754",
        "secondary-container": "#47475d",
        "on-tertiary-container": "#422200",
        "on-primary-container": "#00285d",
        "surface-container-highest": "#353534",
        "error": "#ffb4ab",
        "on-primary-fixed-variant": "#004395",
        "secondary-fixed-dim": "#c6c4df",
        "surface-container": "#201f1f",
        "on-tertiary": "#4c2700",
        "primary-container": "#4d8eff",
        "surface-dim": "#131313",
        "on-secondary-fixed-variant": "#45455b",
        "on-secondary-container": "#b8b6d0",
        "surface-container-high": "#2a2a2a",
        "surface-bright": "#393939",
        "background": "#131313",
        "on-background": "#e5e2e1",
        "secondary": "#c6c4df",
        "tertiary": "#f9ba82",
        "tertiary-container": "#bd8552",
        "on-tertiary-fixed-variant": "#683d0f",
        "tertiary-fixed": "#ffdcc1",
        "on-surface-variant": "#c2c6d6",
        "outline": "#8c909f",
        "tertiary-fixed-dim": "#f9ba82"
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
