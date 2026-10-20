import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";

import { RootLayout } from "./routes/__root.js";
import { PlannerPage } from "./routes/index.js";

/**
 * The router.
 *
 * The routes are declared in code rather than generated from files: the app
 * has one page today, and a hand-written tree keeps the build free of a
 * generator step.
 */
const rootRoute = createRootRoute({
  component: RootLayout,
});

const plannerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: PlannerPage,
});

const routeTree = rootRoute.addChildren([plannerRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
