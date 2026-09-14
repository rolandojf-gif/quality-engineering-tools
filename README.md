# Quality Engineering Tools

Static website for **Quality Engineering Tools** — an independent project
building practical digital tools for automotive quality engineering.

Current tools presented on the site:

1. **VDA 6.3:2023 Process Audit Copilot** — prepare, conduct and evaluate
   VDA 6.3:2023 process audits.
2. **AIAG-VDA SPC Interactive Guide** — interactive guidance for statistical
   process control, process stability and capability analysis.

---

## Architecture

Semantic HTML, modern CSS and a small amount of vanilla JavaScript. Nothing
else: no framework, no CSS library, no npm, no build step, no external fonts,
scripts or trackers. The files you edit are the files that get served.

```
.
├── index.html        single page: header, hero, tools, philosophy, about,
│                     future tools, bottom actions, footer
├── css/
│   └── styles.css    all styling; design tokens live in :root at the top
├── js/
│   └── main.js       menu toggle, masthead scroll state, preview playback
├── assets/
│   └── video/        the two product preview videos (MP4/H.264)
├── netlify.toml      publish directory, security headers, cache policy
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

## Placeholders to replace before going public

Search the repository for `REPLACE-ME`:

| Where | What |
| --- | --- |
| `index.html` — `<link rel="canonical">` | set the final production domain |

The GitHub links already point at `https://github.com/rolandojf-gif`.

When each tool gets a public URL, wrap its heading text in a link:

```html
<h3 class="product__title">
  <a class="product__link" href="https://…">VDA 6.3<br>Process Audit<br>Copilot</a>
</h3>
```

`.product__link` is already styled, and keyboard focus on that link reveals the
product preview exactly as hovering the row does.

## The product preview videos

Both previews are shipped:

| Row | File | Size |
| --- | --- | --- |
| VDA 6.3 Process Audit Copilot | `assets/video/vda-preview.mp4` | ~624 KB |
| AIAG-VDA SPC Interactive Guide | `assets/video/spc-preview.mp4` | ~617 KB |

Each sits inside its product row's `.media-frame`, directly after the ghost
glyph, as the second and upper layer:

```html
<span class="media-frame__glyph" aria-hidden="true">V</span>

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
- Hover is never the only route to content: previews sit at reduced opacity on
  pointer devices only, and resolve on hover **or** keyboard focus. On touch
  devices they are always fully visible.
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
  expected widths, and previews sit at full opacity wherever hover is absent;
- the bottom actions stack at or below 1023px and sit side by side at equal
  height from 1024px up, with no label wrapping at any tested width;
- keyboard order — skip link, brand, Tools, About, GitHub, Explore Tools — each
  with a visible focus ring; Escape closes the small-screen menu and returns
  focus to the toggle;
- the preview reveal (opacity 0.55 → 1, scale 0.985 → 1) under `:focus-within`,
  which is the same rule that handles `:hover`;
- `prefers-reduced-motion: reduce` forced on: transitions drop to ~0s, the
  preview scale and CTA arrow shift are removed, smooth scrolling is disabled;
- a clean load with no console errors and no requests beyond the page, the
  stylesheet and the script.

## Browser support

Modern evergreen browsers. The layout relies on CSS Grid, custom properties,
`clamp()` and `aspect-ratio`; `backdrop-filter` on the masthead is behind an
`@supports` check and degrades to a plain translucent bar.

## Licence

All rights reserved unless stated otherwise. VDA and AIAG-VDA are referenced as
published industry standards; this project is independent and not affiliated
with, authorised by or endorsed by VDA, AIAG or their publishers.
