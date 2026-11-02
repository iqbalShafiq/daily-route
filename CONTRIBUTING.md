# Contributing

Use Node.js 22.16 or newer, pnpm 10.30.3, and Docker.

1. Copy `.env.example` to `.env`.
2. `pnpm infra:up`
3. `pnpm install`
4. `pnpm db:migrate`
5. `pnpm db:seed`
6. `pnpm dev`

Run `pnpm typecheck`, `pnpm lint`, and `pnpm test` before opening a pull
request. Integration tests run against the real database; stop the worker while
they run, or use a database the worker is not filling.

Open a branch from `main`, keep the change focused, and say what you ran.
Commit messages use [Conventional Commits](https://www.conventionalcommits.org/).

Read [`AGENTS.md`](AGENTS.md) before changing the planner, the data pipeline or
the monitor. It is the source of truth for the boundaries. The design system is
in [`DESIGN.md`](DESIGN.md).
