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
| Transjakarta (all classes) | `mode-bus` | `#1d4ed8` | `#38bdf8` |
| MRT Jakarta | `mode-metro` | `#b91c1c` | `#f43f5e` |
| LRT Jakarta | `mode-tram` | `#b45309` | `#f59e0b` |
| LRT Jabodebek | `mode-lrt-jabodebek` | `#0e7490` | `#2dd4bf` |
| KRL Jabodetabek | `mode-rail` | `#334155` | `#a78bfa` |

Two rules hold the set together, and both were checked with a colour
audit rather than by eye:

- **No mode shares a colour with the interface.** The accent is jade and
  the information colour is blue; the modes use the five colours above.
  One colour may mean one thing.
- **No two modes are hard to tell apart.** The set separates the modes
  by ΔE00 of 4.6 in the light theme and 3.7 in the dark one, where the
  older palette reached 1.0 under protanopia.

The colour of a mode is a taxonomy of the *system*, not the livery of the
vehicles: LRT Jakarta and KRL are both red on the road, and Transjakarta
and LRT Jabodebek are both blue. Because five colours can never be
enough on their own, a mode is always encoded twice — colour **and**
line width, and a rider-facing label.

There is no pure black anywhere: `#17150f` is the darkest ink, and
`#111310` is the darkest surface.

## The frame

There is no bar across the top of the window and no column beside the
map. The map owns the window, and the controls float on it.

- The map fills the whole window. The rider is looking at a city.
- The search card floats in the top left corner, 400 px wide, 16 px
  from the edge, with a shadow so it reads as a card above the map.
- The answer opens below it, in the same column, and scrolls inside the
  column rather than the window.
- The controls of the window — the theme, the state of the assistant —
  are a small stack in the top right corner, where the map's own zoom
  control used to be. The zoom moved to the bottom right, so the top
  right corner is free.
- The legend of the modes is a pill on the map, not a bar across it. On
  a phone the legend is gone: the list of the journey names every
  vehicle and shows its colour.
- The assistant opens over the map, in a panel on the right on a wide
  screen and over the whole window on a phone. It is a second way into
  the same data, not a separate mode of the page.
- On a phone the answer rises from the bottom of the window, over the
  map, and the search card stays at the top.

The reasoning, the references and the measurements are in
`research/ux-layout-patterns.md`. `research/tools/ux-visual/layout_check.py`
reads the source and must report nothing.

## Typography

**Plus Jakarta Sans** (variable) for the interface, **JetBrains Mono**
(variable) for codes, times and identifiers. Plus Jakarta Sans is the
typeface the city commissioned for its own identity: it is unmistakable,
locally right, and drawn for Latin script at the small sizes a transit
application lives at.

The scale has seven steps, and nothing sits between them: **40, 28, 20,
16, 15, 13, 12**. A fourteenth pixel would stand too close to the
fifteenth to be a level of hierarchy of its own, so it is not in the
scale.

| Step | Use |
| --- | --- |
| 40 px | The duration of the journey. The only large number on the screen. |
| 28 px | A page title. |
| 20 px | A section title. |
| 16 px | A card title. |
| 15 px | A name in a list: a stop, a route. |
| 13 px | Body text, and the text of a button. |
| 12 px | Metadata, labels, codes. The floor: nothing is ever smaller. |

- Display and headings: `tracking-[-0.03em]` to `tracking-[-0.01em]`.
- Labels: 12 px, weight 500, `ink-3`. Uppercase only for an eyebrow and
  for a line code, never for the name of a place: a name is a name.
- Numbers: tabular (`tabular-nums`) so a column of durations lines up.
- Monospace: station codes, line codes and anything the rider may read out
  loud or type into a search box.

Headings use `text-wrap: balance`, paragraphs use `text-wrap: pretty`.

The whole interface is checked by
`research/tools/ux-visual/typography_check.py`, which reads the source and
reports any size outside the scale, any colour written as a hex value in
a component, and any wording that breaks the rules below. It must report
nothing.

### The words

The language is Indonesian, and it is the language of the operators.

- A **bus** stops at a **halte**; a **train** stops at a **stasiun**. The
  word follows the vehicle: Transjakarta says "Halte BRT Senen", LRT
  Jakarta says "Stasiun Velodrome".
- A **journey** is a "perjalanan", not a "rute terhubung".
- A **fare** is a "tarif", not an "perkiraan tarif": the amounts are
  published.
- The time is written with a dot, as the Indonesian rules of punctuation
  say: "10.14 WIB", not "10:14".
- Rupiah has no space: "Rp5.000".
- A waiting time is an estimate of the headway, so it says so: "tunggu 5
  mnt", never "±5 mnt".
- There is no marketing copy, no exclamation mark and no emoji.

The rules and their sources are in `research/ux-transit-craft.md`.

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

A card has a one pixel border and no shadow. A shadow belongs to what
floats above the page — the popover, the sheet, the map controls — and
not to a box that sits on it.

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
- **The itinerary header** — `durasi · jarak · jumlah perpindahan`, for
  example "58 mnt · 15,2 km · 2 kali pindah". When the journey needs no
  change of vehicle it says "tanpa pindah", so the rider is never told to
  change when there is nothing to change.
- **The fare block** — under the leg list: the amount, then the operator
  that charges it, and the note about a combined ticket when there is one.
  A fare that no operator has published is not shown at all.
- **A walk says what it is for** — "Berjalan kaki ke halte X" for the walk
  to the first vehicle, "Berjalan kaki dari halte X" for the walk after
  the last one, and "Pindah ke [line] di [tempat]" for the walk in
  between. A ride that follows another vehicle says "Ganti dari [line]".
  Only the middle one asks anything of the rider.
- **Disruption banner** — a tinted panel above the itinerary, with the
  severity, the kind, how long ago it was published, and a link to the
  source.
- **Station chip** — the mode colour as a dot next to the name.

## The map

MapLibre GL JS with OpenFreeMap tiles: no key, no quota, no cookie, and
the attribution is rendered by MapLibre as the licence requires.

A route is drawn in three layers, in this order: a **halo** in the
colour opposite the basemap, a **casing** in the colour of the surface,
and the **line** in the colour of the mode. A white casing alone would
do nothing — white on a light map is a contrast of 1.14 to one — so the
halo does the separating. The width of the line carries the mode as
well: 6.5 pixels for the rail, 5 for the bus, 3 and dashed for the
walk.

The rules of the interaction are written down in
`research/ux-map-interaction.md`.

- The light theme uses the `positron` style, the dark theme `dark`.
- The main route is a 5 px line with a 9 px white casing, so it stays
  legible over any map background. It follows the real path of the
  vehicles, taken from the road and rail geometry of the route relations,
  not a straight line between the stops.
- An alternative route is a 4 px dashed line in `warn`.
- The origin is a jade circle, the destination a blue one, the intermediate
  stops small dark dots.
- The map fits the route when a route exists and shows Greater Jakarta
  otherwise.
- The theme is one context shared by the header and the page, so the
  switch in the header changes the map as well.
- The legend is a thin bar along the bottom of the map, without a
  shadow, and it never intercepts a pointer. It lists the vehicles the
  journey uses, in the colour they are drawn in, plus the sign of a
  transfer.
- Every stop of the journey is a point on the map. The two ends are filled
  circles, a transfer is a ring, and the stops in between are small dots.
- A point answers a pointer that rests on it with a popover: the name of
  the place and the vehicle that serves it. Nothing else — a duration or a
  fare belongs to the itinerary, not to the map.
- Clicking a point moves the map to it: a straight, four-hundred
  millisecond move that never zooms out. The movement is skipped when the
  reader asked for less motion.
- The area a point can be found with is bigger than the point itself: a
  radius of 22 pixels, which is a target a finger can find.
- The width of a line carries the mode as well as its colour, so the route
  is readable for a reader who cannot tell the colours apart.

## Walking from where the reader is

The walk is part of the journey, not a separate feature. The panel says
which stop to walk to, how far it is along the footpaths, and which
street to follow at every turn. The path is drawn on the map as the
first leg, in the same dashed style as the walk between two vehicles.

The router is asked on the server. A straight line from the reader to the
stop is not a walk: the busway, the flyover and the river decide which
way a person can actually go.

## The place field

The field offers the stations that match what is written in it. The rules
are written down in `research/ux-search.md`; the short version:

- The suggestions come after two characters and a pause of a quarter of a
  second, never once per letter.
- The list never reorders while it is being read. The order is computed
  when the query changes and not again.
- The focus never leaves the field. The active suggestion is pointed at
  with `aria-activedescendant`, the arrow keys move through the list, and
  `Enter` takes the suggestion.
- The part of the name that matched is marked, and only that part: the
  server reports the ranges it can point at, and the client marks them.
- A match that is strong enough to plan a route to is printed in bold; a
  weaker one is printed in the quieter colour and marked "kurang yakin".
- On a phone the list is a sheet at the bottom of the screen, because the
  keyboard covers half of it.

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
