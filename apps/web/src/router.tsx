import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";

import { RootLayout } from "./routes/__root.js";
import { PlannerPage } from "./routes/index.js";
import { OnboardingPage } from "./features/onboarding/onboarding-page.js";

/**
 * The router.
 *
 * The routes are declared in code rather than generated from files: the app
 * has two pages today, and a hand-written tree keeps the build free of a
 * generator step. `/onboarding` is a destination of its own, never a
 * redirect from the map: a rider who only wants a journey opens `/`.
 */
const rootRoute = createRootRoute({
  component: RootLayout,
});

const plannerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: PlannerPage,
});

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  component: OnboardingPage,
});

const routeTree = rootRoute.addChildren([plannerRoute, onboardingRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
