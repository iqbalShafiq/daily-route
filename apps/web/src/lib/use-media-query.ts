import { useEffect, useState } from "react";

/**
 * Whether the viewport matches a media query.
 *
 * A few regions exist only in one layout but still live in the DOM in the
 * other. CSS hides them; this hook lets the component also remove them
 * from the keyboard order, so a phone reader does not tab into a panel
 * that is off-screen.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = (): void => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}
