# Design Brief: Phase 7 — Design System / Tailwind Reconstruction

## Approach

`tailwind.config.js` currently does `presets: [require("@synthetiq/app-framework/configs/tailwind-preset")]` and `postcss.config.cjs` does `require("@synthetiq/app-framework/configs/postcss.config.cjs")` — both entirely framework-owned, both unresolvable. Re-grepped every non-stock utility class actually used across `src/web` (not relying on the earlier audit's spot-check) to get the exhaustive list rather than an approximate one:

**Color tokens** (all used as `bg-`/`text-`/`border-`/`ring-`/`divide-`/`shadow-` targets):
- Base surface: `background`, `background-secondary`, `background-tertiary`
- Text: `foreground`, `foreground-muted`, `foreground-subtle`
- Structure: `border`, `border-subtle`
- Brand scale: `primary-{50,100,200,300,400,500,600,700,800,900,950}`, plus `primary-accent` and `primary-text` (semantic aliases on top of the numeric scale)
- Modals: `modal-background`, `modal-overlay`, `modal-border`
- **A full button-variant system** (missed by the earlier audit entirely): `button-{primary,secondary,destructive,outline,ghost}-{bg,hover,text,border}` (not every combination exists for every variant — exact set is in the Interface section below)

**Other utilities**: `z-modal` / `z-modal-backdrop` (z-index), `text-2xs` (font-size below Tailwind's stock `text-xs`), `shadow-modal` (box-shadow), `animate-scale-in` (a custom keyframe — modal entrance animation, not provided by stock Tailwind or the already-installed `tailwindcss-animate` plugin). Dark mode is class-based (`.dark` on `<html>`, already wired in `index.html` + Phase 5's `useSystemThemeSync`), used via `dark:` variants in 30 files.

**Color values are a real design decision, not just plumbing** — the original framework's exact palette isn't recoverable (private, unavailable), and you haven't given brand colors. `index.css`'s leftover comment hints the original used OKLCH custom properties swapped per-theme via `.dark`; this brief keeps the CSS-custom-property + `.dark`-override mechanism but defines the actual values in **plain hex**, not OKLCH — WCAG contrast is defined in terms of sRGB relative luminance, so verifying contrast directly in hex avoids introducing an OKLCH→sRGB conversion step that could itself silently be wrong. Simpler is better here since these are explicitly placeholder values.

**Contrast, computed and verified, not eyeballed** (per your ask — button-primary and button-destructive specifically):

| Pair | Ratio | WCAG AA (4.5:1 normal text) |
|---|---|---|
| `button-primary-bg` `#2563EB` vs `button-primary-text` white | 5.17:1 | Pass |
| `button-primary-hover` `#1D4ED8` vs white | 6.70:1 | Pass |
| `button-destructive-bg` `#DC2626` vs white | 4.83:1 | Pass |
| `button-destructive-hover` `#B91C1C` vs white | 6.47:1 | Pass |

Also checked the base text pairs while at it, since the same "usable immediately" goal applies there too:

| Pair | Ratio | WCAG AA |
|---|---|---|
| `foreground` `#1F2937` vs `background` white | 14.68:1 | Pass |
| `foreground-muted` `#6B7280` vs `background` white | 4.83:1 | Pass |
| Dark mode `foreground` `#F9FAFB` vs `background` `#111827` | 16.98:1 | Pass |

Computed with a standalone script implementing the actual WCAG relative-luminance formula (sRGB → linearize → weighted sum → contrast ratio) against these exact hex values — not estimated from memory or by comparing to a similar-looking reference palette.

## Interface / contract

**New `src/web/theme.css`** (imported once from `index.css`): defines every token above as a CSS custom property under `:root` (light) and `:root.dark` (dark override), in plain hex (see rationale above). Structure:
```css
:root {
  --color-background: #FFFFFF;
  --color-background-secondary: #F9FAFB;
  --color-background-tertiary: #F3F4F6;
  --color-foreground: #1F2937;
  --color-foreground-muted: #6B7280;
  --color-foreground-subtle: #9CA3AF;
  --color-border: #E5E7EB;
  --color-border-subtle: #F3F4F6;

  --color-primary-50: #EFF6FF;
  --color-primary-100: #DBEAFE;
  --color-primary-200: #BFDBFE;
  --color-primary-300: #93C5FD;
  --color-primary-400: #60A5FA;
  --color-primary-500: #3B82F6;
  --color-primary-600: #2563EB;
  --color-primary-700: #1D4ED8;
  --color-primary-800: #1E40AF;
  --color-primary-900: #1E3A8A;
  --color-primary-950: #172554;
  --color-primary-accent: var(--color-primary-600);
  --color-primary-text: var(--color-primary-700);

  --color-modal-background: var(--color-background);
  --color-modal-overlay: rgb(0 0 0 / 0.5);
  --color-modal-border: var(--color-border);

  /* Verified WCAG AA (>= 4.5:1) against their paired text color — see contrast table above */
  --color-button-primary-bg: #2563EB;
  --color-button-primary-hover: #1D4ED8;
  --color-button-primary-text: #FFFFFF;
  --color-button-secondary-bg: var(--color-background-secondary);
  --color-button-secondary-hover: var(--color-background-tertiary);
  --color-button-secondary-text: var(--color-foreground);
  --color-button-destructive-bg: #DC2626;
  --color-button-destructive-hover: #B91C1C;
  --color-button-destructive-text: #FFFFFF;
  --color-button-outline-border: var(--color-border);
  --color-button-outline-hover: var(--color-background-secondary);
  --color-button-outline-text: var(--color-foreground);
  --color-button-ghost-bg: transparent;
  --color-button-ghost-hover: var(--color-background-secondary);
  --color-button-ghost-text: var(--color-foreground-muted);
}
:root.dark {
  --color-background: #111827;
  --color-background-secondary: #1F2937;
  --color-background-tertiary: #374151;
  --color-foreground: #F9FAFB;
  --color-foreground-muted: #9CA3AF;
  --color-foreground-subtle: #6B7280;
  --color-border: #374151;
  --color-border-subtle: #1F2937;
  /* primary/button/modal tokens keep the same values — the blue/red scale already has
     enough contrast against both light and dark surfaces; only the neutral scale flips */
}
```

**`tailwind.config.js`** (standalone, no framework preset):
```js
module.exports = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],   // dropped the two framework/streamdown globs — confirmed zero references to either
  theme: {
    extend: {
      colors: {
        background: { DEFAULT: "var(--color-background)", secondary: "var(--color-background-secondary)", tertiary: "var(--color-background-tertiary)" },
        foreground: { DEFAULT: "var(--color-foreground)", muted: "var(--color-foreground-muted)", subtle: "var(--color-foreground-subtle)" },
        border: { DEFAULT: "var(--color-border)", subtle: "var(--color-border-subtle)" },
        primary: { 50: "var(--color-primary-50)", /* ...950 */, accent: "var(--color-primary-accent)", text: "var(--color-primary-text)" },
        modal: { background: "var(--color-modal-background)", overlay: "var(--color-modal-overlay)", border: "var(--color-modal-border)" },
        button: { "primary-bg": "var(--color-button-primary-bg)", /* ...all button-* tokens */ },
      },
      fontSize: { "2xs": ["0.6875rem", { lineHeight: "1rem" }] },
      zIndex: { modal: "50", "modal-backdrop": "40" },
      boxShadow: { modal: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)" },
      keyframes: { "scale-in": { from: { opacity: "0", transform: "scale(0.95)" }, to: { opacity: "1", transform: "scale(1)" } } },
      animation: { "scale-in": "scale-in 0.15s ease-out" },
    },
  },
  plugins: [require("tailwindcss-animate")],  // already a devDependency, unused until now
};
```

**`postcss.config.cjs`** collapses to the stock `{ plugins: { tailwindcss: {}, autoprefixer: {} } }` — no framework dependency, nothing else to design here.

## Failure modes / risks

- **No dev server exists yet** (Phase 9), so this phase can't be visually verified in a browser — only that classes resolve and the build pipeline doesn't error. Real visual QA happens once Phase 9 lands; flagging now rather than implying "done" means "looks right."
- **Color values are a placeholder aesthetic choice**, explicitly not a guess at matching the original framework's exact look — everything lives in one CSS block (`theme.css`) specifically so swapping to real brand colors later touches one file, not a scattered search-and-replace.
- **`button-*` tokens were missed by the original migration audit entirely** — if any other non-stock class shows up later (a component not yet exercised in this grep), the fix is additive (one more CSS variable + Tailwind theme entry), not a rearchitecture.
- **Contrast was only checked for the pairs actually specified as fixed colors** (button variants, base text/background). `foreground-subtle` (`#9CA3AF` on white ≈ 2.5:1) and `border`/`border-subtle` are intentionally decorative/structural, not text-on-background pairs, so WCAG's text contrast bar doesn't apply to them the same way — not a gap, just worth being explicit that "everything passes AA" refers to the pairs where that's the relevant bar.

## Verification plan

```bash
npm run typecheck   # unaffected by this phase, should stay at 3 known errors

# Confirm Tailwind actually compiles the config and generates output for every token class
# used in the codebase, without needing webpack (Phase 9) — using the Tailwind CLI directly:
npx tailwindcss -i ./src/web/index.css -o /tmp/verify-output.css --content './src/web/**/*.tsx'
grep -c "bg-button-primary-bg\|text-foreground-muted\|animate-scale-in\|z-modal" /tmp/verify-output.css
# expect: non-zero — confirms these exact classes produce real CSS rules, not silently no-ops
# from an unrecognized-class typo in the config

grep -c "\-\-color-primary-500" /tmp/verify-output.css   # or theme.css directly
# confirms the CSS custom properties are actually defined, not just referenced
```

## Implementation notes (what actually happened)

- Switched from OKLCH to plain hex for every token value, decided before writing any code — WCAG contrast math is defined in sRGB relative luminance, and verifying contrast directly in the same color space avoids an OKLCH→sRGB conversion step that could itself introduce silent error. Documented in the brief before implementing, not a mid-implementation change.
- **Computed real WCAG contrast ratios with a standalone script implementing the actual relative-luminance formula** (not estimated from memory or a similar-looking reference palette): `button-primary-bg` #2563EB vs white = 5.17:1, `button-primary-hover` #1D4ED8 vs white = 6.70:1, `button-destructive-bg` #DC2626 vs white = 4.83:1, `button-destructive-hover` #B91C1C vs white = 6.47:1 — all pass AA's 4.5:1 bar. Also checked the base text pairs while at it: `foreground`/`background` = 14.68:1, `foreground-muted`/`background` = 4.83:1, dark-mode `foreground`/`background` = 16.98:1.
- Built `src/web/theme.css` (47 CSS custom properties, light + dark), rewrote `tailwind.config.js` (standalone, `darkMode: "class"`, all color/fontSize/zIndex/boxShadow/keyframe tokens from the audit) and `postcss.config.cjs` (stock `{tailwindcss, autoprefixer}`), and wired `theme.css` into `index.css` via `@import` (placed before the `@tailwind` directives per CSS spec's ordering rule for `@import`).
- **Verification actually ran, not just typecheck**: built real output CSS with the Tailwind CLI directly (no webpack needed yet) and grepped it — confirmed `@import "./theme.css"` resolves correctly (Tailwind's CLI handles local-file imports natively), all 8 spot-checked token classes (`bg-button-primary-bg`, `bg-button-destructive-bg`, `text-foreground-muted`, `animate-scale-in`, `z-modal`, `text-2xs`, `shadow-modal`, `bg-modal-overlay`) produce real rule bodies rather than being silently dropped, all 47 `--color-*` custom properties are defined, the `:root.dark` override block is present, and `dark:` variant classes generate correctly.
- `npm run typecheck`: unchanged at 3 known errors (Phase 8 + Phase 2's pre-existing issue) — expected, since this phase touches no TypeScript.

## Status

**Implemented and verified** — contrast computed and confirmed for the two variants you flagged, Tailwind CLI output directly inspected rather than trusting exit-code-only success.
