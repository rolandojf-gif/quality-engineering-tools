# Quality Engineering Tools

Static website for **Quality Engineering Tools** — an independent project
building practical digital tools for automotive quality engineering.

Current tools presented on the site:

1. **VDA 6.3:2023 Process Audit Copilot** — a structured workspace for
   preparing, conducting and evaluating process audits.
2. **AIAG-VDA SPC Interactive Guide** — an interactive guide for statistical
   process control, process stability and capability analysis.

---

## Architecture

Semantic HTML, modern CSS and a small amount of vanilla JavaScript. Nothing
else: no framework, no CSS library, no npm, no build step, no external fonts.
Cloudflare Web Analytics is loaded for privacy-oriented aggregate metrics, and
selected high-value link clicks are logged through Netlify Forms. The files
you edit are the files that get served.

```
.
├── index.html              landing page: header, hero, tools, philosophy,
│                           about, future tools, forms, footer
├── tools/
│   ├── vda-6-3-process-audit-copilot.html
│   └── aiag-vda-spc-guide.html
├── assets/
│   ├── video/              the two product preview videos (MP4/H.264)
│   └── screenshots/        real preview frames used by the tool galleries
├── demo-received.html      static confirmation page for demo access requests
├── feedback-received.html  static confirmation page for feedback submissions
├── privacy.html            privacy notice
├── css/
│   └── styles.css          all styling; design tokens live in :root at the top
├── js/
│   └── main.js             menu toggle, masthead scroll state, preview playback,
│                           gallery lightbox and click tracking
├── media/
│   └── og-image.png        Open Graph social preview image
├── netlify.toml            publish directory, security headers, cache policy
├── robots.txt              search crawler rules
├── sitemap.xml             sitemap
├── .gitignore
└── README.md
```

The two product preview videos live in `assets/video/`; `netlify.toml` caches
that path aggressively.

## Local preview

No tooling required. Any static file server works:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` directly from the file
system also works, but a server is closer to production behaviour.

## Deployment

The site deploys to Netlify as-is.

- **Build command:** none
- **Publish directory:** `.` (already set in `netlify.toml`)

Connect the repository in Netlify and every push to `main` publishes. Netlify
CLI works too:

```bash
netlify deploy --prod
```

---

## The product pages and previews

The landing product titles and `Explore the tool` actions link to the two pages
in `tools/`. The header, lower CTA and form-related pages retain the existing
landing navigation, so a visitor can move from the landing to the tool list and
from either tool page back to the landing.

The gallery images in `assets/screenshots/` are extracted from the two shipped
preview videos. They are the real visual assets used for the product pages,
not synthetic mock-ups. Keep their filenames and relative paths in sync if a
preview is replaced.

## The product preview videos

Both previews are shipped:

| Row | File | Size |
| --- | --- | --- |
| VDA 6.3 Process Audit Copilot | `assets/video/vda-preview.mp4` | ~624 KB |
| AIAG-VDA SPC Interactive Guide | `assets/video/spc-preview.mp4` | ~617 KB |

Each sits inside its product row's `.media-frame`, directly after the quiet
geometric SVG glyph mark, as the second and upper layer:

```html
<span class="media-frame__glyph" aria-hidden="true">
  <svg viewBox="0 0 112 50" fill="currentColor" aria-hidden="true" focusable="false">
    <rect x="4" y="14" width="22" height="22"/>
    <rect x="26" y="23" width="6" height="4"/>
    <rect x="32" y="10" width="30" height="30"/>
    <rect x="62" y="23" width="6" height="4"/>
    <rect x="68" y="6" width="38" height="38"/>
  </svg>
</span>

<video
  class="media-frame__video"
  muted
  loop
  playsinline
  preload="metadata"
  aria-hidden="true"
>
  <source src="assets/video/vda-preview.mp4" type="video/mp4">
</video>
```

Format and encoding:

- **MP4 / H.264 only.** No WebM source and no poster image: the glyph is the
  base state, and the video is transparent until its row activates.
- **Roughly 1280x800 at 30 fps** — matches the frame's `aspect-ratio: 16 / 10`
  exactly, so `object-fit: cover` crops nothing. The shipped pair are 1280x800,
  30 fps, 12 seconds each.
- **Muted, looping, `playsinline`** — required, or mobile browsers refuse to
  play inline. `aria-hidden="true"` keeps a decorative clip out of the
  accessibility tree.
- **Keep them lightweight** — no audio track, short loop, ideally under 1 MB;
  the current files are about 600 KB each. `preload="metadata"` means only the
  header downloads until a row is activated.

Replacing or adding one is just a matter of dropping the file into
`assets/video/` and pointing the `<source>` at it — no CSS or JS changes.
`js/main.js` picks up any `<video>` inside a `.product` automatically:

- pointer devices — the row activates on hover or keyboard focus, the video
  fades in and plays, and leaving pauses it and rewinds to the start;
- touch devices — the row activates while it is on screen and deactivates when
  it scrolls away;
- `prefers-reduced-motion: reduce` — the video never autoplays and stays
  hidden, so the row shows its quiet glyph instead.

Activation is one shared state, `.product.preview-active`, which also drives
the full-width warm row background and the +14px product-title shift.

## Dedicated tool pages

The landing remains the main page. Each tool now has a dedicated page:

- `tools/vda-6-3-process-audit-copilot.html`
- `tools/aiag-vda-spc-guide.html`

Both pages reuse `css/styles.css` and `js/main.js`. They include an Overview,
What it helps you do, How it works, Key capabilities and Gallery structure, plus
a persistent return link to `../`. The gallery thumbnails are real JPEG frames
from the shipped preview videos; there are no invented screenshots. Opening a
thumbnail uses the shared native-dialog lightbox, with close, backdrop click,
Escape, arrow-key navigation and focus restoration.

The two landing product titles and the `Explore the tool` actions are real
internal links to these pages. The header and lower CTA still lead to the
existing `#tools` section, so the requested landing → tools → tool page → back
navigation is available without changing the site's overall information
architecture.

## Design system

All design decisions are CSS custom properties in `css/styles.css` under
`01 Tokens`. Change them there rather than editing individual rules.

| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `#f8f8f6` | page background |
| `--color-surface` | `#f1f1ef` | preview frames, alternate surfaces |
| `--color-text` | `#191922` | primary text |
| `--color-text-2` | `#626268` | secondary text |
| `--color-text-muted` | `#6f6f73` | labels, indexes, meta (see note) |
| `--color-border` | `#d8d8d5` | every divider rule |
| `--color-cta-light` | `#d9d9d6` | left bottom action, with `--color-text` |
| `--color-cta-dark` | `#1b1d21` | right bottom action, with `--color-on-dark` |
| `--color-on-dark` | `#f5f5f2` | text and focus ring on the dark action |

> **Note on `--color-text-muted`.** The original palette used `#919194`. At the
> 11px label size that grey measures 2.96:1 against the background and fails
> WCAG AA, so it was darkened to `#6f6f73` (4.71:1). Size, letter-spacing and
> uppercase treatment still carry the hierarchy. Revert the token if you prefer
> the lighter grey and accept the contrast.

Type is `"Helvetica Neue", Helvetica, Arial, sans-serif` — installed locally on
macOS and Windows, with no webfont request — plus a monospace stack for indexes
and labels. Sizes use `clamp()` so they scale without breakpoints. Display type
is set at weight 400 and tracked tight: `--tracking-hero` (-0.055em) for the
hero, `--tracking-product` (-0.05em) for product titles and the bottom actions,
`--tracking-display` (-0.032em) for section titles. Spacing follows a
`--space-*` scale, and layout uses `--container`, `--gutter` and `--header-h`.

The two bottom actions sit side by side from 64rem and stack below it. Their
outer padding is `max(gutter, 100% - container/2 + gutter)`: because a grid
item's percentage padding resolves against its own half of the group, that
expression is exactly the distance from the viewport edge to the page's text
column, so both labels stay on the same axis as every other line of type.

There is no accent colour by design: typography, grid and hairline rules carry
the identity.

## Accessibility

- Semantic landmarks (`header`, `main`, `nav`, `section`, `footer`) with
  labelled sections, and a skip link to `#main`.
- Visible focus ring on every interactive element via `:focus-visible`.
- Hover is never the only route to content: the base state displays a quiet
  geometric SVG glyph; on fine-pointer devices, video previews activate on
  hover or keyboard focus; on touch devices, an IntersectionObserver activates
  video playback while the row is on screen.
- `prefers-reduced-motion: reduce` removes transitions, transforms and smooth
  scrolling, and suppresses video autoplay.
- All 21 text/background combinations on the page meet WCAG AA; the lowest
  measured ratio is 4.71:1 (11px labels). The dark bottom action measures
  15.45:1, and takes a light focus ring since the near-black default would
  disappear against it.
- `<main>` carries `tabindex="-1"` so the skip link moves focus, not just the
  scroll position.

## What was verified

Checked in a Chromium browser against this exact markup:

- valid HTML nesting, no duplicate `id`s, no broken in-page anchors;
- no horizontal overflow at 320, 360, 375, 414, 480, 600, 768, 834, 1024, 1280,
  1440 and 1920px, and no element crossing the viewport edge at any of them;
- the three product layouts (stacked / tablet / three-column) switch at the
  expected widths, and previews activate via IntersectionObserver on touch screens;
- the bottom actions stack at or below 1023px and sit side by side at equal
  height from 1024px up, with no label wrapping at any tested width;
- keyboard order — skip link, brand, Tools, About, GitHub, Explore the tools —
  each with a visible focus ring; Escape closes the small-screen menu and
  returns focus to the toggle;
- the preview reveal (opacity 0 → 1, scale 0.985 → 1, video play) managed via
  `.product.preview-active` on hover, focusin, and intersection;
- dedicated tool pages, their internal navigation, and gallery lightbox open /
  close / previous / next / Escape behaviour;
- `prefers-reduced-motion: reduce` forced on: transitions drop to ~0s, the
  preview scale and CTA arrow shift are removed, smooth scrolling is disabled;
- a clean load with no console errors, and external requests restricted to the
  privacy-oriented Cloudflare Web Analytics beacon (`beacon.min.js`);
- native form submission routes to static confirmation pages (`/demo-received.html`,
  `/feedback-received.html`) without requiring JavaScript.

## Browser support

Modern evergreen browsers. The layout relies on CSS Grid, custom properties,
`clamp()` and `aspect-ratio`; `backdrop-filter` on the masthead is behind an
`@supports` check and degrades to a plain translucent bar.

## Licence

All rights reserved unless stated otherwise. VDA and AIAG-VDA are referenced as
published industry standards; this project is independent and not affiliated
with, authorised by or endorsed by VDA, AIAG or their publishers.
