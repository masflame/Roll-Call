export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        // neutral greys to avoid light blue tints
        canvas: "#F6F6F7",
        canvasAlt: "#F3F4F6",
        surface: "#FFFFFF",
        surfaceAlt: "#F3F4F6",
        surfaceMuted: "#F1F5F9",
        stroke: {
          subtle: "#E5E7EB",
          strong: "#D1D5DB"
        },
        text: {
          primary: "#0B1320",
          muted: "#556575",
          onBrand: "#FFFFFF"
        },
        brand: {
          // Replaced blue brand palette with neutral/gray tones to remove light blues
          primary: "#111827",
          secondary: "#374151",
          highlight: "#36B37E",
          soft: "#F3F4F6"
        },
        /* CSS variable-backed tokens to match the runtime theme */
        theme: {
          primary: "var(--primary-500)",
          "primary-600": "var(--primary-600)",
          "primary-100": "var(--primary-100)",
          accent: "var(--accent-500)",
          coral: "var(--accent-500)",
          teal: "var(--teal-400)",
          purple: "var(--purple-400)",
          muted: "var(--text-muted)",
          high: "var(--text-high)"
        },
        accent: {
          success: "#36B37E",
          warning: "#F2C94C",
          error: "#DE350B",
          // avoid blue info accent
          info: "#6B7280"
        }
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"]
      },
      borderRadius: {
        md: "6px",
        lg: "8px"
      },
      boxShadow: {
        subtle: "0 18px 40px rgba(17, 24, 39, 0.08)",
        // neutral brand shadow instead of blue tint
        brand: "0 24px 55px rgba(17, 24, 39, 0.08)"
      },
      backgroundImage: {
        "brand-radial": "radial-gradient(120% 120% at 10% 0%, rgba(0,0,0,0.04) 0%, rgba(0, 0, 0, 0.03) 45%, transparent 75%)",
        "brand-sheen": "linear-gradient(135deg, rgba(0, 0, 0, 0.06) 0%, rgba(0,0,0,0.04) 55%, rgba(5, 150, 105, 0.02) 100%)"
      }
    }
  },
  plugins: []
};
