Adds [dororo42/dsh-ungrouped-sweeper](https://github.com/dororo42/dsh-ungrouped-sweeper) under `session`.

- **What it does**: a standalone page on the dsh web server lists every stored session by workspace (group) with titles read from the host's own `dsh-session-title` projection cache, batch-archives ungrouped test conversations via `WorkspaceRegistry.archiveSession(id, { stopActivity: true })`, restores them anytime, and — as an explicit, archived-only second stage — physically purges log directories and projection-cache rows.
- **Extras**: a client half (`dsh.client`, CJS factory form) mounts a 🧉 launcher beside the sidebar's Settings row; zero runtime dependencies; MIT licensed.
- **Verified**: developed against DSH 0.2.0-rc.2 and running in production on my own web profile (list/delete/restore/purge all exercised, including a real purge).
- **Gate check**: repo created 2026-11-12 02:20 UTC, so it is past the 1-day mark; `dsh.bundle` manifest + `cordis.patch.yml` present; real working code.
