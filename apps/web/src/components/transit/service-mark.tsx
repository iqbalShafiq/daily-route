/**
 * A mark for one service class.
 *
 * The mode icon says bus or train. The mark says which service the rider
 * is boarding, because a Mikrotrans and a Royaltrans are not the same
 * vehicle. The stroke uses the current colour, which is the mode token.
 */

const STROKE = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
};

export function ServiceMark({
  serviceClass,
  className,
}: {
  serviceClass: string | null | undefined;
  className?: string;
}) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className}>
      <Glyph serviceClass={serviceClass ?? ""} />
    </svg>
  );
}

function Glyph({ serviceClass }: { serviceClass: string }) {
  switch (serviceClass) {
    case "brt":
      return (
        <>
          <rect x="1.5" y="8" width="9" height="7" rx="1.6" {...STROKE} />
          <rect x="13.5" y="8" width="9" height="7" rx="1.6" {...STROKE} />
          <path d="M10.5 11.5 H13.5" {...STROKE} />
          <Wheel cx={4.5} />
          <Wheel cx={19.5} />
        </>
      );
    case "mikrotrans":
      return (
        <>
          <path d="M7 14 V10 H14 L17 14 Z" {...STROKE} />
          <path d="M14 10 V14" {...STROKE} />
          <Wheel cx={9} />
          <Wheel cx={15} />
        </>
      );
    case "minitrans":
      return (
        <>
          <rect x="5" y="8" width="14" height="7" rx="1.6" {...STROKE} />
          <path d="M12 8 V15" {...STROKE} />
          <Wheel cx={8.5} />
          <Wheel cx={15.5} />
        </>
      );
    case "royaltrans":
      return (
        <>
          <path d="M8 11 L12 6.5 L16 11" {...STROKE} />
          <rect x="5" y="11" width="14" height="5" rx="1.4" {...STROKE} />
          <Wheel cx={8.5} />
          <Wheel cx={15.5} />
        </>
      );
    case "wisata":
      return (
        <>
          <path d="M16 8 V4.5 H19" {...STROKE} />
          <rect x="4" y="8" width="16" height="7" rx="1.6" {...STROKE} />
          <Wheel cx={8} />
          <Wheel cx={16} />
        </>
      );
    case "rumah-susun":
      return (
        <>
          <path d="M6 11 L12 6 L18 11" {...STROKE} />
          <rect x="7" y="11" width="10" height="5" rx="1.2" {...STROKE} />
          <Wheel cx={9.5} />
          <Wheel cx={14.5} />
        </>
      );
    case "transjabodetabek":
      return (
        <>
          <rect x="1.5" y="9" width="21" height="6" rx="1.6" {...STROKE} />
          <path d="M8 9 V15 M16 9 V15" {...STROKE} />
          <Wheel cx={5} />
          <Wheel cx={19} />
        </>
      );
    case "amari":
      return (
        <>
          <path d="M16 3.2 a3.1 3.1 0 1 0 0 5.6 a2.2 2.2 0 1 1 0 -5.6 Z" fill="currentColor" />
          <rect x="4" y="10" width="16" height="6" rx="1.6" {...STROKE} />
          <Wheel cx={8} />
          <Wheel cx={16} />
        </>
      );
    case "rapid-transit":
      return (
        <>
          <rect x="5" y="5" width="14" height="12" rx="2" {...STROKE} />
          <path d="M8 8 H10.2 V12 H8 Z M11.4 8 H13.6 V12 H11.4 Z M14.8 8 H17 V12 H14.8 Z" fill="currentColor" />
        </>
      );
    case "lrt":
      return (
        <>
          <path d="M12 4 V8 M9 5.5 H15" {...STROKE} />
          <rect x="4.5" y="8" width="15" height="7" rx="1.6" {...STROKE} />
          <path d="M9 8 V15 M15 8 V15" {...STROKE} />
          <Wheel cx={8} />
          <Wheel cx={16} />
        </>
      );
    case "commuter-rail":
      return (
        <>
          <rect x="1.2" y="9" width="6.2" height="6" rx="1.2" {...STROKE} />
          <rect x="8.9" y="9" width="6.2" height="6" rx="1.2" {...STROKE} />
          <rect x="16.6" y="9" width="6.2" height="6" rx="1.2" {...STROKE} />
        </>
      );
    default:
      return (
        <>
          <rect x="4" y="7" width="16" height="8" rx="1.8" {...STROKE} />
          <path d="M8 7 V5 H16 V7" {...STROKE} />
          <Wheel cx={8} />
          <Wheel cx={16} />
        </>
      );
  }
}

function Wheel({ cx }: { cx: number }) {
  return <circle cx={cx} cy={17.4} r={1.15} fill="currentColor" />;
}
