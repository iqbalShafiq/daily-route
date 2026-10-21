import { Outlet } from "@tanstack/react-router";

/**
 * The application shell.
 *
 * The window belongs to the map, so there is no bar across the top and
 * no column beside it. The shell only holds the page and lets it fill
 * the window.
 */
export function RootLayout() {
  return (
    <div className="relative h-dvh min-h-0 overflow-hidden bg-bg">
      <main className="h-full min-h-0">
        <Outlet />
      </main>
    </div>
  );
}
