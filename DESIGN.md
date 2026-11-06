# DESIGN.md

The design system of Daily Route. Every value here is a token in
`apps/web/src/styles.css`; nothing in this document may be reproduced as a
literal inside a component.

## The product in one sentence

A rider is standing in Jakarta, in the sun, on a phone, and wants to know
how to get somewhere. The interface has one job: get them moving.

## Principles

1. **The answer comes first.** The board names the way and the destination
   in the sign face at the top of the result, and the minutes, the changes and
   the fare sit immediately under it. The stop list is the detail underneath.
2. **A closed line is the loudest thing on the screen.** A diversion banner
   outranks the itinerary, because a rider who does not read it will travel
   the wrong way.
3. **Legibility over personality.** The interface is used outdoors, at a
   glance, one-handed. Contrast, spacing and type size win over decoration.
4. **Nothing invents.** Every name, duration and distance on the screen
   comes from the data. The interface never estimates.
5. **One accent: the board.** The interface has a single accent, and it is
   not a hue. It is the near-black headsign, the way a bus names its
   destination. Mode colours are data, not decoration: a bus is always the
   bus colour.

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
| `accent` | `#17140f` | `#17140f` | The headsign, the primary action |
| `accent-hover` | `#2a261f` | `#2a261f` | The board under the pointer |
| `accent-ink` | `#f4efe4` | `#f4efe4` | Lamp type on the board |
| `accent-soft` | `#ebe4d6` | `#1d231c` | The paper surface behind a quiet accent |
| `warn` | `#965900` | `#f1b76a` | Warnings, an alternative route |
| `danger` | `#a22b2b` | `#f28f85` | A closure, a critical disruption |
| `info` | `#2348b8` | `#9db8ff` | Neutral information |
| `jpo` | `#8a5a2a` | `#d8a45a` | The pedestrian bridge on the walk being taken |

The board is near-black in both themes. It is never inverted into a white
card at night, and there is no green anywhere in the interface. Danger red is
reserved for a closure; a destructive account action borrows it, a route
never does.

Each semantic colour has a `-soft` companion (`accent-soft`, `warn-soft`,
`danger-soft`, `info-soft`) used as the background of a tinted alert. Because
`accent` is the board and not a foreground, a link on paper is ink with an
underline, never an accent-coloured word.

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

- **No mode shares a colour with the interface.** The accent is the board,
  not a hue; the information colour is blue and the modes use the five
  colours above. One colour may mean one thing.
- **No two modes are hard to tell apart.** The set separates the modes
  by ΔE00 of 4.6 in the light theme and 3.7 in the dark one, where the
  older palette reached 1.0 under protanopia.

The colour of a mode is a taxonomy of the *system*, not the livery of the
vehicles: LRT Jakarta and KRL are both red on the road, and Transjakarta
and LRT Jabodebek are both blue. Because five colours can never be
enough on their own, a mode is always encoded twice — colour **and**
line width, and a rider-facing label.

There is no pure black anywhere: `#14140f` is the darkest ink, `#17140f` is
the board, and `#0d100d` is the darkest surface.

### The map palette

The basemap is recoloured from the `--map-*` tokens in `styles.css`:
`--map-bg`, `--map-park`, `--map-water`, `--map-road`, `--map-casing`,
`--map-rail`, `--map-label` and their dark counterparts. It is a printed
transit sheet, not a navigation screen. The ground is a warm printed street
(`--map-bg` `#e6dfd2`) and the major roads are a lighter cream (`--map-road`
`#f7f3ec`), so the grid stays visible while the route is quieter to read.
Minor roads and paths sit almost on the ground, so the small grid recedes.
Motorways are sand rather than a navigation yellow. Buildings are barely
darker than the paper and fade in only as the map comes close. Parks are a
muted olive paper. Water is the one cool colour, deep enough that the bay is
obvious. The generic road shields are hidden, the place names are sentence
case with no letter-spacing, and the basemap rail stays quiet so the enamel
route is the strong line. The map is the same paper as the panels, not a
separate grey map.

## The frame

There is no bar across the top of the window and no fixed column beside the
map. The map owns the window, and the controls float on it.

- The map fills the whole window. The rider is looking at a city.
- The search is one board: a headsign, two place rows joined by a
  vertical ink line, the swap key and the run button, then the departure
  controls. It is not a card with a form inside it, and no section is
  opened by a rule across the top.
- The headsign is the first line of the board. **Daily Route** is set in
  Barlow Condensed, uppercase, weight 700, 28 px, on a near-black plate with
  4 px of radius. **Jabodetabek** sits under it in Plus Jakarta Sans, 13 px,
  sentence case, with no letter-spacing. There is no icon beside the name.
  The clock and the notice count are not in this header.
- On a wide screen the board floats in the top left corner, 420 px wide,
  16 px from the edge. The answer opens below it in the same column. The
  ways of getting there stay put, and the journey scrolls inside the
  board. The scrollbar is one quiet thumb, 8 px wide with a 4 px radius, in
  the strong line colour, with no track.
- On a phone the board is the full width of the window, edge to edge, with
  the map still behind it. The answer is a sheet above the bottom app bar.
  The sheet has a grab handle that collapses it to a peek and expands it
  again.
- What removes the text comes first and what acts on it comes last, so the
  button that runs the search is the rightmost thing in the form. The
  button that swaps the two places sits immediately to its left. The two
  place rows are joined by one vertical ink line: **From** is a hollow ink
  dot and **To** is a filled one. There is no hairline between them.
- The controls of the window, the theme, the account and the assistant, are
  a paper strip in the top right corner on a wide screen: the surface fill, a
  line border, 4 px of radius and 44 px cells. An idle cell shows its full ink
  icon; on a fine pointer a hover washes the cell with surface-2. Only the
  open assistant or account cell becomes the near-black headsign, with the
  accent fill and lamp ink; there is no second underline. The theme is never
  open and stays paper in both themes. On a phone the strip is the account and
  the theme only, under the search board; the assistant stays a place in the
  bottom app bar. The map draws no zoom buttons. Scroll, a pinch, and the
  keyboard still zoom.
- The account is a paper panel, the same `.panel` as the assistant, opened
  from a `UserRound` control. On a wide screen it is 320 px wide under the
  window controls. On a phone it is a sheet above the bottom bar. It does
  not add a fifth place to that bar, and it does not sit in the headsign.
  Opening it closes the assistant. The assistant and account controls keep
  their icon when open, and that open cell is the near-black headsign. The
  assistant and account headers match the service board's: a 15 px semibold
  ink title, no icon, no hairline under the header,
  and a 44 px ink close control with no tinted plate. The signed-out line says
  the device keeps places until the rider signs in. Delete account is a second
  step in the same panel, not a browser confirm and not a card inside a card.
- The phone has a bottom app bar with four places: **Plan**, **Lines**,
  **Alerts** and **Ask**. It is a navigation region, not a row of tabs in a
  card. The active place is an ink underline under its label. There is no
  plate behind the label and no rule across the top of the bar. Lines and
  Alerts open the service board on that section; Ask opens the assistant
  while the search stays visible above it.
- The service board is a compact dock on the map, not a bar across it. It
  has two sections. **Lines** is the operator strip, the vehicles of the
  current journey, a network summary and a map key; its height follows its
  content. **Notices** is one chronological board; it takes its maximum
  height and scrolls. On a phone the same board is a sheet behind the Lines
  and Alerts places.
- The assistant opens over the map, in a panel on the right on a wide
  screen and as a sheet on a phone. It is a second way into the same data,
  not a separate mode of the page. Its @ list and the account's find field
  offer the same places: the saved ones first, then the map, with a
  loading line while the server answers. The list stays open while it
  loads; it does not vanish and come back.
- A leg of the journey reads in two lines: the name of the line stands
  alone, and the kind of vehicle and the time stand below it, so a long name
  never pushes the time out of the row. The dashed timeline runs
  continuously from one mode plate to the next, through walks and transfers.
- The journey board is one headsign: the route code, the destination, and a
  12 px line with the minutes, the changes and the fare. The two ends are
  named in a sentence on the paper slip below ("From … · To …"). The
  destination name has no arrow.
- A stop name that is longer than its line is not cut into three dots. It
  runs, the way a headline runs along the bottom of a news broadcast, and it
  only runs while the reader points at it.
- Pointing at a stop name opens a card beside it: what kind of place it is,
  which lines stand there and what can be reached on foot from it.
- The journey is framed in the room the rider can actually see: beside the
  answer column on a wide screen and clear of the service board in the
  bottom-right corner, between the board and the answer sheet on a phone.
  The margins are `--map-pad-*` in `styles.css`, and the map reads them when
  it frames a journey.
- A long list of corridor codes in a notice row is ellipsized. Pointing at
  it, or focusing it, opens a panel with every affected line and the scope.
- The route board carries a close button in its header. It dismisses the
  route and returns the board to its first state.
- There are no pulse dots. The one tilted mark in the interface is the
  **Closed** stamp on a blocked result: it lands once, rotated about -8
  degrees, and then it sits still. A status is otherwise a static mark or
  an icon. The loading slit travels inside the headsign.

The reasoning, the references and the measurements are in
`research/ux-layout-patterns.md`. `research/tools/ux-visual/layout_check.py`
reads the source and must report nothing.

## Typography

**Barlow Condensed** (700) is the sign face: the brand, the destination,
and the route code on that board. **Plus Jakarta Sans** (variable) is the
interface face: every sentence a rider reads, and a line code in a list.
**JetBrains Mono** (variable) is kept for tabular times and fares. All
three arrive through a fontsource package; there is no Google Fonts link.

Barlow Condensed is a bus destination board. It is uppercase, tight and
tall, and it only works where the rider is reading a sign rather than a
sentence. Plus Jakarta Sans is the typeface the city commissioned for its
own identity: it is unmistakable, locally right, and drawn for Latin script
at the small sizes a transit application lives at.

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
- The sign face: uppercase, weight 700, `tracking-[0.01em]`. It is never
  used for a sentence.
- Labels: 12 px, weight 600, `ink-3`, sentence case. There are no
  uppercase tracked mono kickers: "Route board", "Operators" and "This
  journey" are written the way a sentence is. A line code may be uppercase
  because that is the operator's spelling.
- Numbers: tabular (`tabular-nums`) so a column of durations lines up.
- Monospace: tabular times, fares and counts. A line code in a list is an
  identifier and is set in the interface face, semibold and
  `tabular-nums`, because the mono face is kept for numbers. The route
  code on the headsign is the sign face, on the operator's plate.

Headings use `text-wrap: balance`, paragraphs use `text-wrap: pretty`.

The typographic checker allows `tracking-[0.01em]`; the sign face uses it,
and no new tracking value was added to the specification.

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
| `radius-card` | 4 px | Boards and panels |
| `radius` (button) | 4 px | Buttons and fields, the travel key |
| `shadow-raised` | 1 px hairline, 1 px lift | Inputs and small map controls |
| `shadow-pop` | A wide, soft shadow | Floating panels, sheets and popovers |

A panel is paper, not glass: a warm surface, a hairline and a soft
ink-tinted shadow. It has no coloured rule across the top. The map is never
blurred through a control. Shadows are tinted with the ink hue, never neutral
black, and never a glow. One level for raised controls, one for overlays;
nothing else gets a shadow.

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

## The drawing

The interface has three drawings, and each is used once for one job. They
are structural, not ornamental: a surface that is not a ticket is separated
by space, never by a rule across its top.

1. **The ticket bite.** A semicircular notch on the left edge of the journey
   result board only. It is cut out of the paper, at the height of the
   perforation. It is not on the empty search, the account sheet or the
   assistant.
2. **The perforation.** A row of holes between the black headsign and the
   paper slip under it. It belongs to the ticket, and to nothing else.
3. **The enamel route.** The active ride is a thick line in the operator's
   colour with a paper casing; a stop far away is an enamel disc (paper
   fill, operator ring), and a close zoom puts the operator's official mark
   inside a small plate. Walks stay dashed ink. A pedestrian bridge is drawn
   only when the current walk uses one.

The particle accent is the **punch chad**: three paper discs that fall once
from the bite when a result first appears. There are no sparkles, no dust and
no particle library.

### The journey result

- The board is one headsign over a paper slip. The headsign is near-black in
  both themes. The route code sits on a small plate in the operator's
  colour, in the sign face at 16 px, and the destination is Barlow Condensed
  at 28 px. Under them a 12 px lamp-muted line gives the minutes, the
  changes and the fare ("Fare Rp5.000").
- The alternatives are rows, not cards. The chosen row is a paper row with a
  2 px ink rail on its left, not an outline around it. A named pattern
  ("9 via Tol") is a sentence in the row, not an extra chip.
- A closure puts the affected name on the same black board, struck through,
  with a **Closed** stamp in the danger colour. There is no separate red
  card and no pulse.
- While the request is in flight a cream slit travels inside the headsign.
  There is no skeleton and no second sentence.
- The destination flips in once, like a split-flap board.

## Components

Every component is a plain React component with Tailwind classes. The
primitives in `apps/web/src/components/ui/` are the vocabulary; a feature
never invents a new one.

### Button

Variants: `primary` (one per view), `secondary` (the default), `ghost`
(tertiary), `subtle` (inside a card), `danger`. Sizes: `sm` 32 px, `md`
40 px, `lg` 48 px, `icon` 36 px square, every one with 4 px of radius. The
primary action is the board: near-black with lamp ink and a hard lower edge,
so pressing it moves the key down by 2 px and removes the edge. It does not
lift or bounce. The secondary washes the paper with surface-2 on hover; its
border stays the line colour and never turns black. Every variant has a
hover, an active state and a disabled state at 40 % opacity. An icon-only
button always carries a tooltip.

### Input

The label sits above the field in the interface face, sentence case, the
clear button on the right. Every field has a placeholder: the label names
the field, and the placeholder says what to type. The field is 44 px tall
and the radius is 4 px.
The focus state is an ink border and a 15 % ink ring. In the search board the
two fields are rows with no box: a vertical ink line joins a hollow **From**
dot to a filled **To** dot. An error state replaces the border with `danger`
and is announced through `aria-invalid`.

### Card

A card is paper: a warm surface and a hairline. It has no shadow unless it
floats above the map, and it has no rule across the top. Cards do not nest.
When two pieces of information belong together, use spacing, not another
card and not a rule. The only rule a surface may carry is the perforation of
a ticket.

### Segmented control (tabs)

Used to switch between the service board sections and between the departure
modes. It is a real tab widget: the ARIA roles and the keyboard behaviour
come from Base UI, and the wrapper only decides how it looks. The active
surface is ink on paper, not another coloured pill.

### Confirmation dialog

Base UI's dialog, wrapped. It is the one place a destructive or leaving
action is confirmed. The popup is paper, with the same 4 px radius as a
panel, and the map behind it is dimmed, never blurred. Cancel is a close button,
so a touch screen reader can leave. A danger confirmation uses the danger
button; every other confirmation uses the primary button.

### Tooltip

Base UI's tooltip, wrapped. Required for every icon-only control. Delay
250 ms, side bottom by default. A one-line tooltip is a small headsign:
near-black, lamp ink, 4 px of radius. A panel tooltip is paper with the
same 4 px radius, used for the affected lines of a notice, the service
window and the corridor patterns.

### Status and motion

A status is a static mark or an icon, never a pulsing dot. The loading slit
travels inside the headsign, from the left edge to the right, and never
overflows it. A selected alternative is a paper row with a 2 px ink rail on
its left, not a badge. The one rotated mark is the **Closed** stamp of a
blocked result.

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
- **The itinerary header** — the headsign names the route and the
  destination; the paper slip under it names the two ends and the numbers.
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
colour opposite the basemap, a **paper casing**, and the **enamel line** in
the colour of the operator, 2 px wider than the mode's own weight. A white
casing alone would do nothing — white on a light map is a contrast of 1.14 to
one — so the halo does the separating. The width of the line carries the
mode as well: 6.5 pixels for the rail, 5 for the bus, and 15 pixels of
dashed ink for the walk, the same thickness as the ride's paper casing. The
dashed walk meets the ride at the platform: both of its ends are closed to the
stop or place it joins, so the journey reads as one line and never floats away
from the stop. A second line of the same operator takes a colour from the
secondary palette, so two corridors never look like one road.

The rules of the interaction are written down in
`research/ux-map-interaction.md`.

- The basemap is OpenFreeMap, recoloured at runtime from the map tokens:
  warm paper, ink labels, muted water, sand motorways and quiet minor
  streets. Place names are sentence case with no letter-spacing, and the
  generic road shields are hidden. Buildings fade in between zoom 13 and 15,
  and the basemap rail stays quiet so the enamel route is the strong line.
  The light and dark map are one style document and two token sets, so the
  map follows the interface theme without a second design to maintain.
- The main route is a 5 px line with a 9 px white casing, so it stays
  legible over any map background. It follows the real path of the
  vehicles, taken from the road and rail geometry of the route relations,
  not a straight line between the stops.
- The map draws the way being followed, and only that way. Choosing
  another way replaces the line; the way that was left is not kept
  beside it.
- A stop far away is an **enamel disc**: a paper fill inside a ring of the
  operator's colour. Close up the disc becomes a small paper plate, and the
  operator's official mark sits inside it at zoom 13.2. The two ends are
  rings on the paper, the destination is the ink one. A notice is a small
  case icon on a surface plate, with no standing circle around it.
- **One enamel bead** travels the open journey once, in about 1.2 seconds,
  with `cubic-bezier(0.77, 0, 0.175, 1)`, and then it rests at the
  destination. It does not loop and it does not read as a live vehicle. A
  reader who asked for less motion sees it at the destination without the
  travel. A walk that the reader is pointing at stays that 15 px dashed
  ink line, drawn above the stops, so a short walk between two vehicles
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
- Every stop of the journey is a point on the map. The two ends are rings on
  the paper, or the operator's plate when the end is a stop; a transfer is a
  ring, and the stops in between are small dots. A place that is not a stop
  keeps its own paper-filled ring with a From/To border; only a stop wears
  the operator's mark. When the two ends stand on the same stop, they are
  one stacked mark: two rings a few pixels apart, and the popover names both.
  Clicking the mark keeps that popover open.
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

The walk is part of the journey, not a separate feature, and it has no
separate card or start-choice panel. Its row says what it is for ("Walk to
the station Grogol"), how far, and how long, with the time on the title's
line. A walk has no service class and no corridor code, so it does not show
those fields. The path is drawn on the map as the first leg, in the same
dashed style as the walk between two vehicles.

The router is asked on the server. A straight line from the reader to the
stop is not a walk: the busway, the flyover and the river decide which
way a person can actually go. When the path crosses a named official JPO,
the row says "Via JPO ...". A bridge only changes the estimate for choosing
the stop; the walk that is drawn is still the router's path, and an unnamed
OSM segment is not named as a JPO.

A JPO is not a transit line. The map draws **only the bridges the current
walk crosses**, never the whole registry: 801 bridges would be a scribble
over the roads, not information. A named official bridge is a thin solid
bronze line with a paper casing from zoom 12.5; its two end rings appear at
zoom 14. An OpenStreetMap-only bridge is a quiet dashed ink line from zoom
15: it is a secondary record, not a named city asset. No bridge carries a
label on the map; the pointer names it and the stops it serves. An underpass
is not a JPO unless the source says so.

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
- A suggestion that comes from the local Overture extract closes the list
  with "Places © Overture Maps"; one that comes from Google Places closes
  it with "Powered by Google". The line is a quiet 12 px sentence that
  sticks to the bottom of the list, and is not an option.
- On a phone the list is a sheet at the bottom of the screen, because the
  keyboard covers half of it.

## Named places and usual journeys

Named places live on the Places tab of the account sheet. The find field is the same combobox as the route search: it opens with the saved places and the map's suggestions, keeps its popover open with a loading line while it searches, and folds away when a suggestion copies its place into the add form. A long list scrolls inside itself and narrows as the rider types. The add form stays closed until the rider asks for it. Password, sign out and delete live on Settings, and the password fields are already open. Sign out and delete each ask in a confirmation dialog before they run. Delete also asks for the password. The rider types
any name and searches a stop, a street, or another place. The same search
offers those saved names, by the name or by the address, in the route
fields and after @ in the assistant. A notice that touches a usual journey is one strip
on the empty board, and it is not mixed into the operator notice list. The
strip says "Not a live departure", because it reports a planned journey and
a stored notice, never a vehicle.

Every vehicle on the route board has its own colour: walking is a dashed
ink line, and each ride line takes the next token of the journey palette in
the order the alternatives use them. Two Transjakarta corridors do not share
a colour. The legend under the journey summary names each vehicle, its time
and its boarding and alighting stops; pointing at a row lights that line on
the map, and pointing at a line on the map opens a small card with the same
names. The row itself remains readable on a phone without a hover.

The add form has a second way in: "Current location". It reads the
browser's position, asks the server for the address, and opens the form
with that address in the place field and "Current location" in the name
field. The rider changes the name to Home or Office and saves. The address
is the place the route will walk from, so the same button in the From field
plans a journey from where the rider stands, and the assistant can start
there too.

## Motion

Motion is used to explain a change, never to decorate.

- Transitions are 150 ms and run on `background-color`, `border-color`,
  `color`, `transform`, `box-shadow`, `grid-template-rows` and
  `max-height`. `top`, `left`, `width` and `height` are never animated, and
  nothing uses `scale(0)`. A sheet may animate its height so the map and the
  answer keep their relationship.
- The active state of a button is a 1–2 px downward push. A button never
  lifts or bounces, and an icon never wiggles. Hover motion is only for a
  fine pointer.
- The departure tabs slide one 2 px ink underline with `transform`, 150 ms,
  `cubic-bezier(0.77, 0, 0.175, 1)`. The night rule is silent: a departure
  between 22:00 and 05:00 WIB prefers fewer dark walks, taken from the chosen
  departure rather than from when the page was opened. No switch, label or
  result sentence says so.
- **Three punch chads** fall once from the ticket bite when a journey first
  appears: three 8 px paper discs in token colours, `transform` and opacity
  only, 400 ms, `cubic-bezier(0.23, 1, 0.32, 1)`. They never loop, never
  follow the pointer, and never appear on the map.
- The destination **flaps in** once per result, one letter at a time, 280 ms
  with a 50 ms stagger, `transform` only.
- A **Closed** stamp lands once in 180 ms, then sits still.
- The map's `fitBounds` is a 600 ms ease-in-out. **One enamel bead** travels
  the journey once in 1.2 s and rests.
- The loading slit travels inside the headsign from the left edge to the
  right; it never overflows.
- The service board folds in one height and grid-row transition; the
  phone sheets rise from the bottom bar and the assistant sheet leaves the
  way it came. Opening the account sheet or the assistant slides the
  service board off the map, and it returns when they close. The account
  sheet uses that same height transition when its content changes.
- There are no pulse dots and no travelling rings around a notice.
- `prefers-reduced-motion` reduces every duration to 0.01 ms; the letters,
  the stamp, the chads and the bead appear in their final state, and the
  layout and the information are unchanged.

## Accessibility

- Every control has an accessible name. Icon-only controls have a tooltip
  and an `aria-label`.
- The tab widget is a real tab list with arrow-key navigation.
- The suggestion list is a `listbox` with `option` children, the input
  carries `role="combobox"`, `aria-expanded` and `aria-controls`, and the
  arrow keys move the highlight.
- The focus ring is a 2 px ink outline with a 2 px offset, and it is never
  removed. It is not an accent glow.
- Colour is never the only signal: a severity is a word as well as a tint,
  and a mode is an icon as well as a colour.
- Body text is at least 13 px with a contrast ratio above 4.5:1 against its
  surface in both themes.

## Content

- The rider interface is English. The riders are in Greater Jakarta, and
  the city's own names stay as the operators write them: "Halte Bundaran
  Senayan", "Stasiun MRT Lebak Bulus". Operator announcements stay in the
  language they were published in.
- The brand line is "Daily Route" set as a headsign, then "Jabodetabek" in
  sentence case. It is not "Jakarta transit", and it is not an app icon.
- Durations are written the way the interface reads them: "45 min",
  "1 hr 20 min".
- No emoji. No marketing copy. No exclamation marks. No tilted stickers
  except the one **Closed** stamp.
- An empty state always says what to do next.
