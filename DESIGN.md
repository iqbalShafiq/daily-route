# DESIGN.md

The design system of Daily Route. Every value here is a token in
`apps/web/src/styles.css`; nothing in this document may be reproduced as a
literal inside a component.

## The product in one sentence

A rider is standing in Jakarta, in the sun, on a phone, and wants to know
how to get somewhere. The interface has one job: get them moving.

## Principles

1. **The answer comes first.** The duration and the number of transfers are
   the largest elements of a result. The stop list is the detail underneath.
2. **A closed line is the loudest thing on the screen.** A diversion banner
   outranks the itinerary, because a rider who does not read it will travel
   the wrong way.
3. **Legibility over personality.** The interface is used outdoors, at a
   glance, one-handed. Contrast, spacing and type size win over decoration.
4. **Nothing invents.** Every name, duration and distance on the screen
   comes from the data. The interface never estimates.
5. **One accent.** The interface has a single accent colour (jade). Mode
   colours are data, not decoration: a bus is always the bus colour.

## Colour

Colours live as custom properties and are exposed to Tailwind through
`@theme inline`, so a utility such as `bg-surface` emits `var(--surface)`
and follows the theme automatically. The dark theme is a token swap, never
a second set of utility classes.

### Surfaces and ink

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `bg` | `#fbfaf8` | `#111310` | The page |
| `surface` | `#ffffff` | `#1a1c18` | Cards, the header, the map legend |
| `surface-2` | `#f4f2ee` | `#22251f` | Secondary fills, the chat bubbles |
| `surface-3` | `#ebe8e1` | `#2b2f27` | Chips, the "clear" button |
| `ink` | `#17150f` | `#f2efe7` | Primary text |
| `ink-2` | `#4a4740` | `#c6c2b6` | Secondary text |
| `ink-3` | `#7a766c` | `#8e8a7e` | Hints, metadata |
| `line` | `#e5e1d8` | `#2e322a` | Borders |
| `line-strong` | `#cfcabe` | `#414639` | Emphasised borders |

The neutrals are warm, not blue-grey: the paper metaphor suits a city guide
and reads better under the warm light of Jakarta.

### Accent and semantics

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `accent` | `#0b6b4f` | `#4ade9e` | The primary action, the active state |
| `warn` | `#a85b00` | `#f0b45e` | Warnings, an alternative route |
| `danger` | `#a4262c` | `#f28b82` | A closure, a critical disruption |
| `info` | `#1d4ed8` | `#93b4fd` | Neutral information |

Each semantic colour has a `-soft` companion (`accent-soft`, `warn-soft`,
`danger-soft`, `info-soft`) used as the background of a tinted alert.

### Mode colours

A mode is data, and its colour is constant across the interface.

| Mode | Token | Light | Dark |
| --- | --- | --- | --- |
| Transjakarta (all classes) | `mode-bus` | `#0b6b4f` | `#4ade9e` |
| MRT Jakarta | `mode-metro` | `#1d4ed8` | `#93b4fd` |
| LRT Jakarta | `mode-tram` | `#c2410c` | `#fb923c` |
| LRT Jabodebek | `mode-lrt-jabodebek` | `#6d28d9` | `#a78bfa` |
| KRL Jabodetabek | `mode-rail` | `#334155` | `#94a3b8` |

There is no pure black anywhere: `#17150f` is the darkest ink, and
`#111310` is the darkest surface.

## Typography

**Plus Jakarta Sans** (variable) for the interface, **JetBrains Mono**
(variable) for codes, times and identifiers. Plus Jakarta Sans is the
typeface the city commissioned for its own identity: it is unmistakable,
locally right, and drawn for Latin script at the small sizes a transit
application lives at.

- Display and headings: `tracking-[-0.02em]`, weight 600.
- Body: 15 px on desktop inputs, 13–14 px in dense lists.
- Labels: 12 px, weight 500, `ink-3`, always above the field.
- Numbers: tabular (`tabular-nums`) so a column of durations lines up.
- Monospace: station codes, line codes and anything the rider may read out
  loud or type into a search box.

Headings use `text-wrap: balance`, paragraphs use `text-wrap: pretty`.

## Spacing, radius and elevation

The spacing scale is Tailwind's default 4 px step. The rhythm inside a
surface is `gap-3` between fields, `gap-4` between blocks, `px-4` inside a
card, `py-3` between rows.

| Token | Value | Use |
| --- | --- | --- |
| `radius-card` | 14 px | Cards and panels |
| `radius` (button) | 10–12 px | Buttons and fields |
| `shadow-card` | 1 px hairline + a wide, soft shadow | Raised surfaces |
| `shadow-pop` | The same, tighter and deeper | Overlays: suggestions, tooltips |

Shadows are tinted with the ink hue, never neutral black, and never a glow.
One shadow level for cards, one for overlays; nothing else gets a shadow.

## Layout

### The frame

The application fills the viewport and never scrolls as a whole. The header
is fixed; the body is the working area.

- **Phone (`< 768px`)** — a single column. The map takes the top 42 vh, the
  controls scroll underneath it. The planner and the assistant are two tabs.
- **Desktop (`≥ 1024px`)** — a two-column grid:
  `minmax(380px, 440px) 1fr`. The control column scrolls; the map fills the
  right half and stays put while the rider scrolls the itinerary.

The split is asymmetric on purpose: the map is the context, the text is the
answer, and the answer is what needs the narrow column.

### Breakpoints

`sm` 640 px, `md` 768 px, `lg` 1024 px, `xl` 1280 px. The layout changes
only at `lg`; everything else is fluid. No percentage arithmetic in flexbox:
the grid does the work.

### Full-height regions

Use `h-dvh`, never `h-screen` and never a pixel height. The mobile browser
chrome changes the viewport height, and `vh` is the one unit that lies about
it.

## Components

Every component is a plain React component with Tailwind classes. The
primitives in `apps/web/src/components/ui/` are the vocabulary; a feature
never invents a new one.

### Button

Variants: `primary` (one per view), `secondary` (the default), `ghost`
(tertiary), `subtle` (inside a card), `danger`. Sizes: `sm` 32 px, `md`
40 px, `lg` 48 px, `icon` 36 px square. Every variant has a hover, an
active state (`translate-y-px`, a physical push) and a disabled state at 45 %
opacity. An icon-only button always carries a tooltip.

### Input

The label sits above the field, the icon is decorative and always on the
left, the clear button on the right. The field is 44 px tall, the radius is
12 px, and the focus state is a 2 px accent border plus a 15 % accent ring.
An error state replaces the border with `danger` and is announced through
`aria-invalid`.

### Card

A card is a surface with a border and one shadow. Cards do not nest. When
two pieces of information belong together, use spacing or a divider
(`border-t`), not another card.

### Segmented control (tabs)

Used to switch between the planner and the assistant. It is a real tab
widget: the ARIA roles and the keyboard behaviour come from Base UI, and
the wrapper only decides how it looks.

### Tooltip

Base UI's tooltip, wrapped. Required for every icon-only control. Delay
250 ms, side bottom by default.

## The transit components

- **Mode icon** — one lucide pictogram per mode: bus, MRT (train front),
  LRT (tram front), KRL (train), walk (footprints). The icon tells the
  rider the mode before the label does.
- **Leg list** — a vertical timeline: the mode icon on the left, the line
  and its code, the boarding and alighting stops, and the duration on the
  right. The full stop list is a `<details>` element, because the rider
  usually wants the shape of the journey, not every halte.
- **Disruption banner** — a tinted panel above the itinerary, with the
  severity, the kind, how long ago it was published, and a link to the
  source.
- **Station chip** — the mode colour as a dot next to the name.

## The map

MapLibre GL JS with OpenFreeMap tiles: no key, no quota, no cookie, and
the attribution is rendered by MapLibre as the licence requires.

- The light theme uses the `positron` style, the dark theme `dark`.
- The main route is a 5 px line with a 9 px white casing, so it stays
  legible over any map background.
- An alternative route is a 4 px dashed line in `warn`.
- The origin is a jade circle, the destination a blue one, the intermediate
  stops small dark dots.
- The map fits the route when a route exists and shows Greater Jakarta
  otherwise.
- The theme is one context shared by the header and the page, so the
  switch in the header changes the map as well.
- The legend sits at the bottom left in a translucent surface with a blur,
  and it never intercepts a pointer.

## Motion

Motion is used to explain a change, never to decorate.

- Transitions are 150 ms and run on `background-color`, `border-color`,
  `color`, `transform` and `box-shadow` only. `top`, `left`, `width` and
  `height` are never animated.
- The active state of a button is a 1 px downward push.
- The map's `fitBounds` is a 600 ms ease.
- `prefers-reduced-motion` reduces every duration to 0.01 ms; the layout
  and the information are unchanged.

## Accessibility

- Every control has an accessible name. Icon-only controls have a tooltip
  and an `aria-label`.
- The tab widget is a real tab list with arrow-key navigation.
- The suggestion list is a `listbox` with `option` children, the input
  carries `role="combobox"`, `aria-expanded` and `aria-controls`, and the
  arrow keys move the highlight.
- The focus ring is a 2 px accent outline with a 2 px offset, and it is
  never removed.
- Colour is never the only signal: a severity is a word as well as a tint,
  and a mode is an icon as well as a colour.
- Body text is at least 13 px with a contrast ratio above 4.5:1 against its
  surface in both themes.

## Content

- The language is Indonesian, because the riders are in Jakarta.
- Place names are written exactly as the operator writes them: "Halte
  Bundaran Senayan", "Stasiun MRT Lebak Bulus".
- Durations are written the way people say them: "45 mnt", "1 jam 20 mnt".
- No emoji. No marketing copy. No exclamation marks.
- An empty state always says what to do next.
