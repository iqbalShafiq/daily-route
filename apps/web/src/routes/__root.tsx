import { useQuery } from "@tanstack/react-query";
import { Moon, Sun, TrainFront } from "lucide-react";
import { Outlet } from "@tanstack/react-router";

import { Button } from "../components/ui/button.js";
import { Tooltip } from "../components/ui/tooltip.js";
import { api } from "../lib/api.js";
import { useTheme } from "../lib/theme.js";

/**
 * The application shell.
 *
 * The header carries the brand, the live status of the assistant and the
 * theme switch. Everything else belongs to the page.
 */
export function RootLayout() {
  const { theme, toggle } = useTheme();

  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 60_000,
    retry: false,
  });

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-bg">
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-ink">
          <TrainFront aria-hidden className="size-4.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-ink">
            Daily Route
          </p>
          <p className="truncate text-[12px] text-ink-3">
            Rute Transjakarta, MRT, LRT, dan KRL Jabodetabek
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span
            className="hidden items-center gap-2 rounded-md bg-surface-2 px-2 py-1 text-[12px] text-ink-2 sm:inline-flex"
            title={health.data?.agent ? `Model: ${health.data.model}` : "Model belum dikonfigurasi"}
          >
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{
                backgroundColor: health.data?.agent ? "var(--accent)" : "var(--warn)",
              }}
            />
            {health.data?.agent ? "Asisten aktif" : "Asisten nonaktif"}
          </span>

          <Tooltip label={theme === "dark" ? "Mode terang" : "Mode gelap"}>
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Ganti tema">
              {theme === "dark" ? (
                <Sun aria-hidden className="size-4" />
              ) : (
                <Moon aria-hidden className="size-4" />
              )}
            </Button>
          </Tooltip>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
