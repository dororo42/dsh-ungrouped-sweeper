# dsh-ungrouped-sweeper

Sweep the dsh web conversation list: a standalone page lists every stored session by workspace (group), and batch-archives the ungrouped test conversations through the official workspace registry — stopping any running work first — with one-click restore.

会话清扫器：按分组列出 dsh web 的全部对话，一键批量归档未分组的测试对话（走官方 workspace 注册表、先停运行任务），随时恢复。

DeepSeek Harness (DSH) plugin. Developed against DSH 0.2.0-rc.2. Zero dependencies.

## Install

```sh
dsh plugin --profile web add github:dororo42/dsh-ungrouped-sweeper
```

Or search `ungrouped-sweeper` in the [dsh-market](https://github.com/dsh-market/dsh-market) plugin market inside DSH.

## Usage

Open the page dsh web serves (append the launch token dsh printed at startup):

```
http://127.0.0.1:3080/ungrouped-sweeper?token=<your-launch-token>
```

The page shows three sections:

- **未分组** — stored sessions that belong to no workspace; the pile this plugin exists to clear. Checkbox each, or use 清空未分组 for all of them at once.
- **分组：\<name\>** — sessions already filed into a workspace.
- **已归档（可恢复）** — previously swept sessions; tick some and click 恢复所选 to bring them back.

Subagent sessions (fork lineage, `origin: subagent`) are never listed and never touched.

## What "delete" means here

Two stages, so an accident always has one step to undo:

1. **删除所选 / 清空未分组 → archive** (reversible). Sessions are archived via `WorkspaceRegistry.archiveSession(sessionId, { stopActivity: true })` — the same durable write the product's own grouping surface performs. Consequences:
   - the conversation disappears from every grouping surface immediately;
   - running turns, subagents, background jobs and schedules are stopped instead of blocking the archive;
   - the session log on disk is untouched, so everything is recoverable (restore from the page's 已归档 section, from the web UI's archived list, or `POST /ungrouped-sweeper/api/v1/restore`).

2. **彻底删除所选 → purge** (irreversible, archived sessions only). Physically removes the session's log directory under `~/.dsh/sessions/` and its projection-cache row, drops the id from the archive set **and from every workspace's accounting slot** (archiving keeps that slot by design for unarchive-restore; without detaching, the native UI keeps displaying a session whose bytes are gone). Ghost rows — ids the registry still accounts but session persistence holds no bytes for — are listed separately on the page under 幽灵记录 and can be purged to reconcile the accounting. The API refuses purging a stored, unarchived session.

## API

All routes are served by the web profile's `webServer` and re-checked against the host's admission gate (`connection.requestRejection`).

| Route | Method | Description |
| --- | --- | --- |
| `/ungrouped-sweeper` | GET | The standalone page. A 🧹 launcher beside the sidebar's Settings row (client half) opens it in one click — no token typing needed. |
| `/ungrouped-sweeper/api/v1/list` | GET | `{ workspaces, sessions }` — sessions carry `id`, `title` (official dsh-session-title value, falling back to the first user text), `createdAt`, `sizeBytes`, `workspaceId`, `archived`, `pinned`, `subagent`. |
| `/ungrouped-sweeper/api/v1/delete` | POST | `{ sessionIds: [...] }` or `{ scope: "ungrouped" }`; archives each with `stopActivity: true`, returns `{ archived, failed }`. |
| `/ungrouped-sweeper/api/v1/restore` | POST | `{ sessionIds: [...] }`; unarchives, returns `{ restored, failed }`. |
| `/ungrouped-sweeper/api/v1/purge` | POST | `{ sessionIds: [...] }`; archived sessions and ghost rows (registry-accounted ids with no bytes on disk) — unarchives, detaches workspace accounting, deletes the log directory and projection cache, returns `{ purged, skipped, failed }`. |

## Related plugins

The DSH ecosystem has many session-deletion plugins; this one is the narrow, reversible take — clear the ungrouped clutter without touching log bytes:

- [`dsh-workspace-cleaner`](https://github.com/…) — checkbox cleanup page that permanently deletes logs and projection caches.
- [`dsh-archive-manager`](https://github.com/…) family — manage what is already archived (search, restore, hard delete).
- [`dsh-auto-archive`](https://github.com/…) — archives idle sessions automatically on a timer.
- `dsh-session-sweeper` — despite the name, it quarantines *other tools'* local histories (Claude Code, Codex CLI…), not the dsh web conversation list; the name similarity is why this package is called `ungrouped-sweeper`.

## License

MIT
