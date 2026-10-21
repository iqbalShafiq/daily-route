import { useQuery } from "@tanstack/react-query";
import { Moon, Sun } from "lucide-react";
import { Outlet } from "@tanstack/react-router";

import { Button } from "../components/ui/button.js";
import { Tooltip } from "../components/ui/tooltip.js";
import { api } from "../lib/api.js";
import { useTheme } from "../lib/theme.js";

/**
 * The application shell.
 *
 * There is no bar across the top. The map is the product, so the map
 * owns the window, and the controls that are not about the map itself
 * — the theme, the state of the assistant — sit on the map as a small
 * stack of controls, where the other map controls already are.
 */
export function RootLayout() {
  const { theme, toggle } = useTheme();

  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 60_000,
    retry: false,
  });

  const agentReady = health.data?.agent === true;

  return (
    <div className="relative h-dvh min-h-0 overflow-hidden bg-bg">
      <main className="h-full min-h-0">
        <Outlet />
      </main>

      {/*
       * The controls that belong to the window rather than to the map.
       * They sit in the top right corner, above the map's own zoom
       * control, so the top of the screen belongs to the map.
       */}
      <div className="pointer-events-none absolute top-3 right-3 z-30 flex flex-col items-end gap-2">
        <Tooltip
          label={
            agentReady
              ? `Asisten aktif${health.data?.model ? `, model ${health.data.model}` : ""}`
              : "Asisten belum aktif: belum ada kunci model"
          }
        >
          <span
            aria-label={agentReady ? "Asisten aktif" : "Asisten belum aktif"}
            className="pointer-events-auto flex size-9 cursor-default items-center justify-center rounded-lg border border-line bg-surface/90 text-ink-3 shadow-raised backdrop-blur"
          >
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ backgroundColor: agentReady ? "var(--accent)" : "var(--warn)" }}
            />
          </span>
        </Tooltip>

        <Tooltip label={theme === "dark" ? "Mode terang" : "Mode gelap"}>
          <Button
            variant="secondary"
            size="icon"
            onClick={toggle}
            aria-label="Ganti tema"
            className="pointer-events-auto border-line bg-surface/90 shadow-raised backdrop-blur"
          >
            {theme === "dark" ? (
              <Sun aria-hidden className="size-4" />
            ) : (
              <Moon aria-hidden className="size-4" />
            )}
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
