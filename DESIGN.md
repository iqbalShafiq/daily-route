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
| `bg` | `#f2ede2` | `#0d100d` | The page |
| `surface` | `#fbf8f0` | `#151914` | Panels, the search board, the dock |
| `surface-2` | `#ebe4d6` | `#1d231c` | Secondary fills, the chat bubbles |
| `surface-3` | `#ded4c2` | `#273026` | Chips, the "clear" button |
| `ink` | `#14140f` | `#f4efe2` | Primary text |
| `ink-2` | `#49453a` | `#c9c1b0` | Secondary text |
| `ink-3` | `#6f695c` | `#918977` | Hints, metadata |
| `line` | `#d8cfbd` | `#293127` | Borders |
| `line-strong` | `#b6ab96` | `#3d483a` | Emphasised borders |

The neutrals are warm, not blue-grey: the paper metaphor suits a city guide
and reads better under the warm light of Jakarta.

### Accent and semantics

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `accent` | `#0b6b4f` | `#64e6ad` | The primary action, the active state |
| `warn` | `#965900` | `#f1b76a` | Warnings, an alternative route |
| `danger` | `#a22b2b` | `#f28f85` | A closure, a critical disruption |
| `info` | `#2348b8` | `#9db8ff` | Neutral information |

Each semantic colour has a `-soft` companion (`accent-soft`, `warn-soft`,
`danger-soft`, `info-soft`) used as the background of a tinted alert.

### Mode colours

A mode is data, and its colour is constant across the interface.

| Mode | Token | Light | Dark |
| --- | --- | --- | --- |
| Transjakarta (all classes) | `mode-bus` | `#1f4fbf` | `#5aa2ff` |
| MRT Jakarta | `mode-metro` | `#b3262e` | `#ff6b6b` |
| LRT Jakarta | `mode-tram` | `#a45a0a` | `#f3a63a` |
| LRT Jabodebek | `mode-lrt-jabodebek` | `#0e6f6a` | `#4fd7c9` |
| KRL Jabodetabek | `mode-rail` | `#343f52` | `#a9a2f5` |

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

There is no pure black anywhere: `#14140f` is the darkest ink, and
`#0d100d` is the darkest surface.

### The map palette

The basemap is recoloured from the `--map-*` tokens in `styles.css`:
`--map-bg`, `--map-park`, `--map-water`, `--map-road`, `--map-casing`,
`--map-rail`, `--map-label` and their dark counterparts. The map is the
same paper as the panels, not a separate grey map.

## The frame

There is no bar across the top of the window and no fixed column beside the
map. The map owns the window, and the controls float on it.

- The map fills the whole window. The rider is looking at a city.
- The search is one board: a brand plate, two place rows joined by a
  vertical route line, the swap key and the run button, then the departure
  controls. It is not a card with a form inside it.
- The brand plate is the first line of the board: **Daily Route**, then
  **Jabodetabek** underneath, without an icon. The clock and the notice
  count are not in this header.
- On a wide screen the board floats in the top left corner, 420 px wide,
  16 px from the edge. The answer opens below it in the same column. The
  ways of getting there stay put, and the journey scrolls inside the
  board. The scrollbar is the panel's own: a thin thumb in the strong line
  colour.
- On a phone the board is the full width of the window, edge to edge, with
  the map still behind it. The answer is a sheet above the bottom app bar.
  The sheet has a grab handle that collapses it to a peek and expands it
  again.
- What removes the text comes first and what acts on it comes last, so the
  button that runs the search is the rightmost thing in the form. The
  button that swaps the two places sits immediately to its left. The
  hairline between the two place rows starts after the marker column, so it
  never crosses the vertical route line.
- The controls of the window, the theme, the account and the assistant,
  are a small stack in the top right corner on a wide screen. On a phone
  the assistant is a place in the bottom app bar. The theme and the account
  float on the map. The bottom bar stays four places.
  The map draws no zoom buttons. Scroll, a pinch, and the keyboard still
  zoom.
- The account is a paper panel, the same `.panel` as the assistant, opened
  from a `UserRound` control. On a wide screen it is 320 px wide under the
  window controls. On a phone it is a sheet above the bottom bar. It does
  not add a fifth place to that bar, and it does not sit in the brand plate.
  Opening it closes the assistant. The assistant and account controls keep
  their icon when open; the button fills with ink instead of swapping the
  mark. The signed-out line says the device keeps places until the rider
  signs in. Delete account is a second step in the same panel, not a browser
  confirm and not a card inside a card.
- The phone has a bottom app bar with four places: **Plan**, **Lines**,
  **Alerts** and **Ask**. It is a navigation region, not a row of tabs in a
  card. The active place has a paper plate behind its label only, and a
  short jade rule centred on the top edge. The plate does not wrap the
  icon. Lines and Alerts open the service board on that section;
  Ask opens the assistant while the search stays visible above it.
- The service board is a compact dock on the map, not a bar across it. It
  has two sections. **Lines** is the operator strip, the vehicles of the
  current journey, a network summary and a map key; its height follows its
  content. **Notices** is one chronological board; it takes its maximum
  height and scrolls. On a phone the same board is a sheet behind the Lines
  and Alerts places.
- The assistant opens over the map, in a panel on the right on a wide
  screen and as a sheet on a phone. It is a second way into the same data,
  not a separate mode of the page.
- A leg of the journey reads in two lines: the name of the line stands
  alone, and the kind of vehicle and the time stand below it, so a long name
  never pushes the time out of the row. The dashed timeline runs
  continuously from one mode plate to the next, through walks and transfers.
- The journey header names the two ends with **From** and **To** labels and
  a small route marker, not a horizontal rule. The fare sits at the right
  of that block, and the duration is the large number below it.
- A stop name that is longer than its line is not cut into three dots. It
  runs, the way a headline runs along the bottom of a news broadcast, and it
  only runs while the reader points at it.
- Pointing at a stop name opens a card beside it: what kind of place it is,
  which lines stand there and what can be reached on foot from it.
- The journey is framed in the room the rider can actually see: beside the
  answer column on a wide screen, between the board and the answer sheet on
  a phone. The margins are `--map-pad-*` in `styles.css`, and the map reads
  them when it frames a journey.
- A long list of corridor codes in a notice row is ellipsized. Pointing at
  it, or focusing it, opens a panel with every affected line and the scope.
- The route board carries a close button in its header. It dismisses the
  route and returns the board to its first state.
- There are no pulse dots and no tilted stamps anywhere. A status is a
  static mark or an icon. The loading line travels inside its track.

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

The interface is English. Operator announcements stay in the language
they were published in, and place names stay as the network writes them.

- A **bus** stops at a **stop**; a **train** stops at a **station**.
- A **journey** is a "journey". A **fare** is a "fare". The amounts are
  published, so the label is not "estimated fare".
- The clock is Jakarta time, written "10:14 WIB".
- Rupiah has no space and keeps the ticket grouping: "Rp5.000".
- A price that depends on the card the rider holds is written as two
  prices: the one with the card, and the one without it. The smaller
  one is the total, the other one is a line under it. One number would
  be wrong for one of the two riders.
- A waiting time is an estimate of the headway, so it says so: "wait 5
  min", never "±5 min".
- There is no marketing copy, no exclamation mark and no emoji.
- The operator switches and the notice list sit in one service board, in
  two sections. The operator strip is a compact five-column grid: the
  operator's mark, a colour rule, the number of routes or lines, and a
  toggle. It is not a cloud of pills. Turning an operator off hides that
  operator's lines and stop marks. The section is not padded with an empty
  card: its height follows its content.
- The notice section is one chronological board, not a card per notice,
  with a maximum height and its own scroll. A notice row has a severity
  rail on the left, the time in Jakarta time, the kind, the line codes
  (ellipsized, with the full list in a hover panel), the title, and what
  the notice is about: a stop the rider walks to, a corridor or rail line
  the rider rides, or an
  operator's whole service. Nothing is "unplaced" and there is no
  "No single stop" bucket: the row names the stop, the corridor, or the
  operator. The board only shows a notice whose verified window covers
  now; an upcoming window is not a current notice. Severity is the rail
  and the icon tint, never a second badge. A verified notice shows its
  next window ("until 09:00 WIB" or "next 24 Oct 03:00-09:00 WIB") instead
  of the event's last day. Only a notice whose window covers now is a map
  marker; an upcoming one stays on the board.
- Following a notice moves the map to what it names. A stop notice frames
  its stops (a road closure can name several). A corridor notice frames and
  lights that corridor. A network-wide notice has nowhere to go: the row
  is not a button and has no chevron, and it says which operator is meant.
  The board has no filter: a notice about a corridor is shown as that
  corridor, so there is no second list to switch to.
- The summary line says how many notices are open, and how many are at a
  stop, on a corridor, or across a network. The last check is a separate
  line at the foot, written as a sentence from the monitor, not as a raw
  event.

The rules and their sources are in `research/ux-transit-craft.md`.

## Spacing, radius and elevation

The spacing scale is Tailwind's default 4 px step. The rhythm inside a
surface is `gap-3` between fields, `gap-4` between blocks, `px-4` inside a
card, `py-3` between rows.

| Token | Value | Use |
| --- | --- | --- |
| `radius-card` | 12 px | Cards and panels |
| `radius` (button) | 8–10 px | Buttons and fields, the travel key |
| `shadow-raised` | 1 px hairline, 1 px lift | Inputs and small map controls |
| `shadow-pop` | A wide, soft shadow | Floating panels, sheets and popovers |

A panel is paper, not glass: a warm surface, a hairline, a slightly stronger
top rule and a soft ink-tinted shadow. The map is never blurred through a
control. Shadows are tinted with the ink hue, never neutral black, and never
a glow. One level for raised controls, one for overlays; nothing else gets a
shadow.

## Layout

### The frame

The application fills the viewport and never scrolls as a whole. The map is
the page; the controls are sheets on it.

- **Phone (`< 1024px`)** — the map fills the window. The search board is the
  full width of the top edge, the answer is a sheet above the bottom app
  bar, and the service board and the assistant are sheets above the same
  bar. The bottom app bar is `--bottom-bar-h` tall plus the safe area.
- **Desktop (`≥ 1024px`)** — the map fills the window. The search and the
  answer are one floating column on the left, 420 px wide and 16 px from the
  edge. The service board floats in the bottom right, 380 px wide. The
  window controls are the top right corner.

The split is asymmetric on purpose: the map is the context, the text is the
answer, and the answer is what needs the narrow column.

### Breakpoints

`sm` 640 px, `md` 768 px, `lg` 1024 px, `xl` 1280 px. The layout changes
only at `lg`; everything else is fluid. No percentage arithmetic in flexbox:
the grid does the work.

### Full-height regions

Use `dvh`, never `vh` and never a fixed pixel height. The mobile browser
chrome changes the viewport height, and `vh` is the one unit that lies about
it. The search board and the bottom bar are the two fixed heights on a
phone; `--bar-h` and `--bottom-bar-h` carry them.

## Components

Every component is a plain React component with Tailwind classes. The
primitives in `apps/web/src/components/ui/` are the vocabulary; a feature
never invents a new one.

### Button

Variants: `primary` (one per view), `secondary` (the default), `ghost`
(tertiary), `subtle` (inside a card), `danger`. Sizes: `sm` 32 px, `md`
40 px, `lg` 48 px, `icon` 36 px square. The primary action is jade on a
hard lower edge, so pressing it moves the key down by 2 px and removes the
edge. Every variant has a hover, an active state and a disabled state at
40 % opacity. An icon-only button always carries a tooltip.

### Input

The label sits above the field in the monospaced station-label voice, the
clear button on the right. Every field has a placeholder: the label names
the field, and the placeholder says what to type. The field is 44 px tall
and the radius is 8 px.
The focus state is the accent border plus a 15 % accent ring. In the search
board the two fields are rows with no box: a vertical route line and a
marker join them, and the hairline between the rows starts after the marker
column. An error state replaces the border with `danger` and is announced
through `aria-invalid`.

### Card

A card is paper: a warm surface, a hairline and a stronger top rule. It has
no shadow unless it floats above the map. Cards do not nest. When two
pieces of information belong together, use spacing or a divider
(`border-t`), not another card.

### Segmented control (tabs)

Used to switch between the service board sections and between the departure
modes. It is a real tab widget: the ARIA roles and the keyboard behaviour
come from Base UI, and the wrapper only decides how it looks. The active
surface is ink on paper, not another coloured pill.

### Tooltip

Base UI's tooltip, wrapped. Required for every icon-only control. Delay
250 ms, side bottom by default. A panel tooltip is used for the affected
lines of a notice, the service window and the corridor patterns.

### Status and motion

A status is a static mark or an icon, never a pulsing dot. A loading line
travels inside its track, from the left edge to the right, and never
overflows it. A selected route says "Selected" in small monospaced type; it
is not a rotated stamp.

## The transit components

- **Mode icon** — a walk keeps the footprints pictogram. Every ride uses
  the operator's official compact symbol, the same one the map uses on a
  halte: `transjakarta-mark`, `mrt-jakarta-mark`, `lrt-jakarta-mark`,
  `lrt-jabodebek-mark` and `krl-mark`. The wordmark is kept for the
  operator strip, where there is room. A generic service glyph is only a
  fallback for an operator with no compact file.
- **Leg list** — a vertical timeline: the mode plate on the left, the line
  and its code, the boarding and alighting stops, and the duration on the
  right. The dashed line runs from one plate to the next, through the gap
  between legs and behind the plate. It is not cut at a leg boundary. The
  full stop list is a `<details>` element, because the rider usually wants
  the shape of the journey, not every halte.
- **The itinerary header** — the two ends carry **From** and **To** labels
  and a small route marker; the duration is the large number below them.
  The summary line says the distance, the changes and the walking, for
  example "12.4 km · 2 changes · walk 350 m". When the journey needs no
  change of vehicle it says "no changes".
- **The fare** — the amount sits with the duration, because those are
  the two numbers a rider compares. On each way in the list the amount
  is its own figure, not a word inside the line codes. Under the total,
  each charge is its own row: the operator on the left, its amount on
  the right, and the reason on the line beneath, such as the kilometres
  or a change that stayed inside the same station. The company that
  holds a flat fare is not written in that row. A second price, when
  the card changes it, is another row aligned with those amounts. A
  fare that no operator has published is not shown at all.
- **How to pay** — not a block under the itinerary. Each way carries a
  ticket icon. Pointing at it, focusing it or touching it opens the notes
  about tapping in, the card and the balance. The fare breakdown is a
  receipt: a dashed top edge, one line per charge and a tabular amount on
  the right. The notes are the same ones the fare quote already carries.
- **A walk says what it is for** — "Walk to the stop X" for the walk
  to the first vehicle, "Walk from the station X" for the walk after
  the last one, and "Change to [line] at [place]" for the walk in
  between. A ride that follows another vehicle says "Change from [line]".
  Only the middle one asks anything of the rider.
- **Disruption banner** — a tinted strip above the itinerary, with the
  severity rail, the kind, the station or corridor, and a link to the
  source. A labelled scenario says "Sample watch" before the title. The
  journey then says whether it is blocked at that stop or whether the stop
  is not on the way being followed. The comparison keeps the closed way and
  the first way that avoids it.
- **Station chip** — the mode colour as a square next to the name, never a
  pulsing dot.
- **Notice codes** — a long list of line codes is ellipsized in the row.
  Hovering or focusing it opens a panel with every affected code and the
  scope; the row itself still opens the stored source.
- **Route close** — the route board header carries a close button. It
  dismisses the route and returns the board to "Where to?".
- **Notice freshness** — a notice row says when it was last checked and
  when it will be checked again. If there is no fresh update, it says so in
  plain language ("No fresh update yet. Next check …"), not with the
  internal word "unverified".
- **Temporary service** — a ride on an announced shuttle, replacement
  corridor or additional route says "Temporary" next to its service class.
  It uses the operator mark and colour, not a new colour, and its source
  remains the announcement. It is never presented as a permanent corridor.

## The map

MapLibre GL JS with OpenFreeMap tiles: no key, no quota, no cookie. The
licence line "© OpenStreetMap · OpenFreeMap" is drawn by the app as text.
There is no information button and no zoom control on the map.

A route is drawn in three layers, in this order: a **halo** in the
colour opposite the basemap, a **casing** in the colour of the surface,
and the **line** in the colour of the mode. A white casing alone would
do nothing — white on a light map is a contrast of 1.14 to one — so the
halo does the separating. The width of the line carries the mode as
well: 6.5 pixels for the rail, 5 for the bus, 3 and dashed for the
walk.

The rules of the interaction are written down in
`research/ux-map-interaction.md`.

- The basemap is OpenFreeMap, recoloured at runtime from the map tokens:
  warm paper, ink labels, muted water and roads. The light and dark map are
  one style document and two token sets, so the map follows the interface
  theme without a second design to maintain.
- The main route is a 5 px line with a 9 px white casing, so it stays
  legible over any map background. It follows the real path of the
  vehicles, taken from the road and rail geometry of the route relations,
  not a straight line between the stops.
- The map draws the way being followed, and only that way. Choosing
  another way replaces the line; the way that was left is not kept
  beside it.
- The origin is a jade circle, the destination an ink one, the intermediate
  stops small dark dots. A notice is a small case icon on a surface plate,
  with no standing circle around it and no travelling outline. The camera
  follows the way being read, so a closure that way avoids does not pull the
  frame open.
- A dash travels along each ride, in the colour of the surface, so the
  direction can be read. It is absent when the reader asks for less
  motion. A walk that the reader is pointing at is drawn above the
  stops as an 11 px ink line, so a short walk between two vehicles
  still reads. The other legs fade.
- The map fits the route when that route is first shown, and again when
  the journey being followed changes. Choosing one part of it in the
  list frames that part, closer than the whole journey, and choosing
  it again returns to the whole journey. The move is 600 ms,
  ease-in-out. A zoom or a pan the reader makes stays until then.
  With no route on screen the map shows Greater Jakarta.
- The theme is one context shared by the map and the panels, so the switch
  changes the map as well.
- With no journey chosen, the map draws every operating line. A halo
  separates the line from the basemap. Transjakarta is a solid band with
  a light centre, MRT a band with a light core, each LRT a band with its
  own stitch, and KRL two rails on sleepers in the rail colour. Feeders
  use the same language and fade in as the map comes closer. Halte and
  stasiun are small marks in the operator colour. They are drawn by the
  map, not as a marker per stop. Transjakarta marks wait until the map is
  close. Every mark is the operator's official compact symbol; the operator
  strip keeps the wordmark, where the name has room. On the idle map no
  incident plate is drawn: the service board carries the notices. Under a
  journey the map keeps the trunk lines and the journey's own stops; the
  local lines and the full stop layer return when the journey is closed.
- The service board is a dock in the bottom right on a wide screen, and a
  sheet behind the Lines and Alerts places on a phone. It has two sections.
  Lines lists the operators, the current journey and the network summary;
  its height follows its content. Notices has a maximum height and scrolls.
  A change of section measures the new panel and animates one height
  transition, so the two heights meet without a jump. The window controls
  stay clear above the dock. The latest check is a line at the foot.
- When a journey is open, the Lines section also lists the vehicles that
  journey uses, with their official wordmarks, plus the modes.
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

The field offers the halte and stasiun that match what is written in it,
then places that are not stops: a landmark, a street, a building. Choosing
one of those keeps its name. The journey walks to the stop that serves it,
and that walk is drawn on the map. An empty field lists the places saved
on this browser and the places used recently, and the journeys already
asked for sit under the field, on the same floating surface, until an
answer replaces them. The labelled example is the first row of that
surface, above the journeys already asked for. The notice, the example
and the journeys leave together once an answer is on screen, so the
answer is not pushed down by a second copy of the same closure. The
surface scrolls when the list is taller than the map can spare. On a
phone the theme control floats below the search board, so it does not sit
on that surface. The assistant, on a phone, opens as a sheet between the
search board and the bottom bar; the map stays visible above it. The names
are not painted straight onto the map. The rules
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
- The order of the list is the only thing that says which match is the
  better one. A rider reads a name, not a score, so no badge says how
  sure the list is about it.
- On a phone the list is a sheet at the bottom of the screen, because the
  keyboard covers half of it.

## Named places and usual journeys

Named places live on the Places tab of the account sheet. A long list scrolls inside itself and can be filtered by name or address. The add form stays closed until the rider asks for it. Password, sign out and delete live on Settings, and the password fields are already open. The rider types
any name and searches a stop, a street, or another place. The same search
offers those saved names, by the name or by the address, in the route
fields and after @ in the assistant. A notice that touches a usual journey is one strip
on the empty board, and it is not mixed into the operator notice list. The
strip says "Not a live departure", because it reports a planned journey and
a stored notice, never a vehicle.

## Motion

Motion is used to explain a change, never to decorate.

- Transitions are 150 ms and run on `background-color`, `border-color`,
  `color`, `transform`, `box-shadow`, `grid-template-rows` and
  `max-height`. `top` and `left` are never animated. A sheet may animate
  its height so the map and the answer keep their relationship.
- The active state of a button is a 1–2 px downward push.
- The answer rises into place; the alternatives arrive in a short stagger.
  The journey duration counts up once, in about half a second.
- The map's `fitBounds` is a 600 ms ease-in-out. A dash travels along
  the ride for as long as that ride is on the map, and it stops when
  the reader asks for less motion.
- The loading line travels inside its track from the left edge to the
  right; it never overflows the track.
- The service board folds in one height and grid-row transition; the
  phone sheets rise from the bottom bar and the assistant sheet leaves the
  way it came. Opening the account sheet or the assistant slides the
  service board off the map, and it returns when they close. The account
  sheet uses that same height transition when its content changes.
- There are no pulse dots, no travelling rings around a notice and no
  tilted stamps. A status is a static mark or an icon.
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

- The rider interface is English. The riders are in Greater Jakarta, and
  the city's own names stay as the operators write them: "Halte Bundaran
  Senayan", "Stasiun MRT Lebak Bulus". Operator announcements stay in the
  language they were published in.
- The brand line is "Daily Route", then "Jabodetabek". It is not "Jakarta
  transit".
- Durations are written the way the interface reads them: "45 min",
  "1 hr 20 min".
- No emoji. No marketing copy. No exclamation marks. No tilted stickers.
- An empty state always says what to do next.
