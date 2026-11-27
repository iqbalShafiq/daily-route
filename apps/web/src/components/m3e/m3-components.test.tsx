import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ReactElement } from "react";

import {
  M3BottomSheet,
  M3Button,
  M3Card,
  M3Chip,
  M3CircularWavyProgress,
  M3ConnectedButtonGroup,
  M3ExpressiveList,
  M3ExpressiveListItem,
  M3ExtendedFab,
  M3Fab,
  M3FloatingToolbar,
  M3IconButton,
  M3LinearWavyProgress,
  M3LoadingIndicator,
  M3ModeBadge,
  M3NavigationBar,
  M3Shape,
  M3Slider,
  M3Snackbar,
  M3SplitButton,
  M3StandardButtonGroup,
  M3Switch,
  clamp01,
  m3ShapeClipPath,
  nextDetent,
  percentOf,
  wrapIndex,
} from "./index.js";

function render(element: ReactElement): string {
  return renderToStaticMarkup(element);
}

describe("M3Shape", () => {
  it("renders a decorative clip-path container", () => {
    const html = render(<M3Shape shape="cookie9" size={52} />);
    expect(html).toContain('class="m3-shape"');
    expect(html).toContain("clip-path:var(--shp-cookie9)");
    expect(html).toContain("width:52px");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-shape="cookie9"');
  });

  it("exposes every generated shape name", () => {
    expect(m3ShapeClipPath("softburst")).toBe("var(--shp-softburst)");
    expect(m3ShapeClipPath("scallop")).toBe("var(--shp-scallop)");
  });
});

describe("progress", () => {
  it("renders an indeterminate labelled loader", () => {
    const html = render(
      <M3LoadingIndicator variant="contained" size="lg" label="Finding a route" />,
    );
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-label="Finding a route"');
    expect(html).toContain("m3-loader--contained");
    expect(html).toContain("m3-loader--lg");
    expect(html).not.toContain("aria-valuenow");
  });

  it("renders a linear wavy bar at 50 percent", () => {
    const html = render(<M3LinearWavyProgress value={0.5} label="Journey" />);
    expect(html).toContain('aria-label="Journey"');
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain("m3-wavy__fill");
  });

  it("clamps the circular progress and keeps its label", () => {
    const html = render(
      <M3CircularWavyProgress value={1.4} size={64} label="Upload">
        <span>done</span>
      </M3CircularWavyProgress>,
    );
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain("m3-circular-wavy__fill");
    expect(html).toContain("m3-circular-wavy__label");
  });
});

describe("actions", () => {
  it("renders a size, variant and full-width button as a real button", () => {
    const html = render(
      <M3Button size="m" variant="tonal" fullWidth>
        Plan a journey
      </M3Button>,
    );
    expect(html).toContain('type="button"');
    expect(html).toContain("m3-btn--m");
    expect(html).toContain("m3-btn--tonal");
    expect(html).toContain("m3-btn--block");
    expect(html).toContain("Plan a journey");
  });

  it("labels an icon button and exposes the selected state only for a toggle", () => {
    const action = render(
      <M3IconButton label="Swap places" widthVariant="wide">
        <span>icon</span>
      </M3IconButton>,
    );
    expect(action).toContain('aria-label="Swap places"');
    expect(action).not.toContain("aria-pressed");

    const toggle = render(
      <M3IconButton label="Show notices" toggleable selected variant="tonal">
        <span>icon</span>
      </M3IconButton>,
    );
    expect(toggle).toContain('aria-pressed="true"');
    expect(toggle).toContain("is-selected");
    expect(toggle).toContain("m3-icon-btn--tonal");
  });

  it("renders a radiogroup where the selected option is checked", () => {
    const html = render(
      <M3ConnectedButtonGroup
        ariaLabel="Trip options"
        value="fastest"
        size="m"
        onChange={() => undefined}
        options={[
          { value: "fastest", label: "Fastest" },
          { value: "fewest", label: "Fewest changes" },
        ]}
      />,
    );
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Trip options"');
    expect(html).toContain('role="radio"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("is-selected");
  });

  it("keeps one Tab stop when the value matches no option", () => {
    const html = render(
      <M3ConnectedButtonGroup
        ariaLabel="Trip options"
        value="unknown"
        onChange={() => undefined}
        options={[
          { value: "fastest", label: "Fastest" },
          { value: "fewest", label: "Fewest changes" },
        ]}
      />,
    );
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
  });

  it("wraps a standard group in a labelled group", () => {
    const html = render(
      <M3StandardButtonGroup ariaLabel="Zoom">
        <M3Button size="s">In</M3Button>
        <M3Button size="s">Out</M3Button>
      </M3StandardButtonGroup>,
    );
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Zoom"');
    expect(html).toContain("m3-btn-group--standard");
  });

  it("exposes the split button trigger as a menu button", () => {
    const html = render(
      <M3SplitButton
        label="Go"
        onPrimaryClick={() => undefined}
        menuItems={[{ id: "leave", label: "Leave at", onSelect: () => undefined }]}
      />,
    );
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("m3-split__toggle");
  });

  it("labels a FAB and an extended FAB", () => {
    expect(render(<M3Fab label="Locate me">+</M3Fab>)).toContain('aria-label="Locate me"');
    const extended = render(
      <M3ExtendedFab icon={<span>+</span>} label="New journey" tone="primary" />,
    );
    expect(extended).toContain("m3-extended-fab--primary");
    expect(extended).toContain("New journey");
  });

  it("morphs a selected chip and exposes its pressed state", () => {
    const html = render(
      <M3Chip variant="filter" selected leadingDotColor="var(--krl)">
        KRL
      </M3Chip>,
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("is-selected");
    expect(html).toContain("m3-chip__dot");
    expect(html).toContain("--m3-chip-dot:var(--krl)");
  });
});

describe("selection and input", () => {
  it("renders a switch with role switch", () => {
    const html = render(
      <M3Switch checked onCheckedChange={() => undefined} aria-label="Avoid dark walks" />,
    );
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("is-checked");
  });

  it("renders a labelled slider at its position", () => {
    const html = render(
      <M3Slider
        value={25}
        min={0}
        max={100}
        onChange={() => undefined}
        label="Walk"
        valueLabel="25 min"
      />,
    );
    expect(html).toContain('type="range"');
    expect(html).toContain('aria-valuetext="25 min"');
    expect(html).toContain("--m3-slider-progress:25.00%");
  });

  it("renders a labelled toolbar", () => {
    const html = render(
      <M3FloatingToolbar variant="vibrant" ariaLabel="Map tools">
        <span>button</span>
      </M3FloatingToolbar>,
    );
    expect(html).toContain('role="toolbar"');
    expect(html).toContain("m3-toolbar--vibrant");
  });
});

describe("navigation and surfaces", () => {
  it("marks the active destination with a pill and a page state", () => {
    const html = render(
      <M3NavigationBar
        active="plan"
        onChange={() => undefined}
        items={[
          { id: "plan", label: "Plan", icon: <span /> },
          { id: "alerts", label: "Alerts", icon: <span />, badge: 2 },
        ]}
      />,
    );
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("m3-nav__pill");
    expect(html).toContain("Alerts, 2 new");
  });

  it("renders a bottom sheet at its detent with a real handle", () => {
    const html = render(
      <M3BottomSheet detent="half" onDetentChange={() => undefined} ariaLabel="Journey details">
        <p>Body</p>
      </M3BottomSheet>,
    );
    expect(html).toContain('data-detent="half"');
    expect(html).toContain("height:50dvh");
    expect(html).toContain("Resize sheet, half");
    expect(html).toContain("m3-sheet__body");
  });

  it("renders a snackbar only while open", () => {
    expect(render(<M3Snackbar open={false} message="Saved" />)).toBe("");
    const html = render(
      <M3Snackbar
        open
        message="Journey saved"
        actionLabel="Undo"
        onAction={() => undefined}
        onDismiss={() => undefined}
      />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("Journey saved");
    expect(html).toContain("Undo");
    expect(html).toContain('aria-label="Dismiss notification"');
  });

  it("renders a card with a role container and a radius", () => {
    const html = render(
      <M3Card variant="primary-container" radius="xl">
        <span>Content</span>
      </M3Card>,
    );
    expect(html).toContain("m3-card--primary-container");
    expect(html).toContain("m3-card--radius-xl");
  });

  it("renders an expressive list with a shaped leading mark", () => {
    const html = render(
      <M3ExpressiveList ariaLabel="Saved places" surface="low">
        <M3ExpressiveListItem
          title="Home"
          subtitle="Kebayoran"
          leadingShape="cookie9"
          leading="H"
        />
      </M3ExpressiveList>,
    );
    expect(html).toContain('aria-label="Saved places"');
    expect(html).toContain("m3-list--low");
    expect(html).toContain("clip-path:var(--shp-cookie9)");
    expect(html).toContain("m3-list__title");
  });
});

describe("mode badge", () => {
  it("always carries colour, an icon and a text label", () => {
    const html = render(<M3ModeBadge mode="krl" />);
    expect(html).toContain("KRL");
    expect(html).toContain("background-color:var(--krl)");
    expect(html).toContain("<svg");
  });

  it("resolves a line from its system and service class", () => {
    const html = render(<M3ModeBadge systemId="lrt-jakarta" serviceClass="lrt" size="md" />);
    expect(html).toContain("LRT Jakarta");
    expect(html).toContain("background-color:var(--lrtk)");
    expect(html).toContain("m3-mode-badge--md");
  });

  it("keeps a hidden label in the icon variant", () => {
    const html = render(<M3ModeBadge mode="walk" size="icon" />);
    expect(html).toContain('aria-label="Walk"');
    expect(html).toContain("m3-mode-badge__label--hidden");
    expect(html).toContain("background-color:var(--walk)");
  });
});

describe("pure helpers", () => {
  it("clamps progress to 0..1", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(3)).toBe(1);
    expect(percentOf(0.5)).toBe("50.00%");
  });

  it("moves the sheet through its detents and wraps", () => {
    expect(nextDetent("peek", 1)).toBe("half");
    expect(nextDetent("half", 1)).toBe("expanded");
    expect(nextDetent("expanded", 1)).toBe("peek");
    expect(nextDetent("peek", -1)).toBe("expanded");
  });

  it("wraps an index around a ring", () => {
    expect(wrapIndex(0, 3, -1)).toBe(2);
    expect(wrapIndex(2, 3, 1)).toBe(0);
    expect(wrapIndex(1, 3, 1)).toBe(2);
  });
});
