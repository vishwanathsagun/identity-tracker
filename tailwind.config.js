"use strict";
// Vendored verbatim from the Stitch prototype inline tailwind.config (design is frozen)
module.exports = {
  darkMode: "class",
  // Added for the CLI build: the Play CDN scanned the live DOM instead.
  // Covers index.html (incl. its inline script's class strings) and all app modules.
  content: ["./index.html", "./src/**/*.{js,mjs}"],
  theme: {
    extend: {
      "colors": {
        "surface-container-high": "#34243a",
        "surface-container": "#291a2f",
        "on-primary-fixed-variant": "#6f3253",
        "on-surface": "#F8F4E9",
        "on-primary-container": "#ffdbe9",
        "primary-fixed": "#ffd8e8",
        "inverse-on-surface": "#3a2b40",
        "surface-variant": "#3f2f45",
        "primary-container": "#935073",
        "surface-container-low": "#24162a",
        "on-tertiary-fixed": "#2e0d34",
        "tertiary": "#e6b7e8",
        "on-tertiary-fixed-variant": "#5e3a62",
        "secondary-fixed-dim": "#dcc2a8",
        "surface": "#1c0e22",
        "on-secondary-container": "#cdb49b",
        "surface-bright": "#443349",
        "primary-fixed-dim": "#ffafd5",
        "on-primary": "#541b3c",
        "outline-variant": "#514349",
        "background": "#1c0e22",
        "on-secondary-fixed-variant": "#554430",
        "on-error": "#690005",
        "tertiary-fixed": "#ffd6ff",
        "secondary-fixed": "#F6DBC0",
        "surface-tint": "#ffafd5",
        "on-primary-fixed": "#3a0526",
        "inverse-primary": "#8a496b",
        "on-secondary": "#3d2d1b",
        "surface-container-highest": "#3f2f45",
        "on-tertiary-container": "#ffd8ff",
        "surface-dim": "#1c0e22",
        "on-error-container": "#ffdad6",
        "inverse-surface": "#f3dbf8",
        "error-container": "#93000a",
        "outline": "#9e8c93",
        "on-background": "#F8F4E9",
        "secondary-container": "#584632",
        "error": "#ffb4ab",
        "on-secondary-fixed": "#261908",
        "primary": "#ffafd5",
        "tertiary-container": "#7f5883",
        "tertiary-fixed-dim": "#e6b7e8",
        "secondary": "#F6DBC0",
        "on-tertiary": "#45234b",
        "on-surface-variant": "#d5c1c8",
        "surface-container-lowest": "#16091c",
        "dusk-plum": "#502D55",
        "dusk-mauve": "#935073",
        "dusk-peach": "#F6DBC0",
        "dusk-cream": "#F8F4E9",
        "aurora-purple": "#7C5CFF"
      },
      "borderRadius": {
        "DEFAULT": "1rem",
        "lg": "2rem",
        "xl": "3rem",
        "full": "9999px"
      },
      "spacing": {
        "space-lg": "1.5rem",
        "margin": "3rem",
        "space-sm": "0.5rem",
        "space-xl": "2.5rem",
        "gutter": "1.5rem",
        "space-md": "1rem",
        "margin-mobile": "1.25rem",
        "gutter-mobile": "1rem",
        "space-xs": "0.25rem"
      },
      "fontFamily": {
        "headline-md": ["Plus Jakarta Sans"],
        "headline-lg": ["Plus Jakarta Sans"],
        "headline-display": ["Plus Jakarta Sans"],
        "headline-display-mobile": ["Plus Jakarta Sans"],
        "body-sm": ["Inter"],
        "label-lg": ["Inter"],
        "label-md": ["Inter"],
        "label-sm": ["Inter"],
        "headline-lg-mobile": ["Plus Jakarta Sans"],
        "body-md": ["Inter"],
        "body-lg": ["Inter"],
        "headline-sm": ["Plus Jakarta Sans"],
        "stat-counter": ["Inter"]
      },
      "fontSize": {
        "headline-md": ["22px", {"lineHeight": "28px", "fontWeight": "600"}],
        "headline-lg": ["32px", {"lineHeight": "40px", "letterSpacing": "-0.01em", "fontWeight": "600"}],
        "headline-display": ["48px", {"lineHeight": "56px", "letterSpacing": "-0.02em", "fontWeight": "700"}],
        "headline-display-mobile": ["36px", {"lineHeight": "44px", "letterSpacing": "-0.015em", "fontWeight": "700"}],
        "body-sm": ["12px", {"lineHeight": "18px", "fontWeight": "400"}],
        "label-lg": ["14px", {"lineHeight": "20px", "letterSpacing": "0.01em", "fontWeight": "600"}],
        "label-md": ["12px", {"lineHeight": "16px", "letterSpacing": "+0.02em", "fontWeight": "500"}],
        "label-sm": ["10px", {"lineHeight": "14px", "letterSpacing": "0.04em", "fontWeight": "600"}],
        "headline-lg-mobile": ["26px", {"lineHeight": "34px", "letterSpacing": "-0.01em", "fontWeight": "600"}],
        "body-md": ["14px", {"lineHeight": "22px", "fontWeight": "400"}],
        "body-lg": ["16px", {"lineHeight": "26px", "fontWeight": "400"}],
        "headline-sm": ["18px", {"lineHeight": "24px", "fontWeight": "600"}],
        "stat-counter": ["28px", {"lineHeight": "32px", "letterSpacing": "-0.02em", "fontWeight": "700"}]
      }
    }
  }
}

module.exports.plugins = [require("@tailwindcss/forms")];
