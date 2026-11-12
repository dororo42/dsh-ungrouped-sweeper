/**
 * dsh-ungrouped-sweeper — bulk-clean the dsh web conversation list.
 *
 * A cordis plugin for DeepSeek Harness profiles that mount a `webServer`.
 * It adds a small HTTP surface under /ungrouped-sweeper that:
 *   1. lists every stored session with its workspace (group) membership,
 *      archived/pinned state and its title — taken from the host's own
 *      `dsh-session-title` projection cache, falling back to the first
 *      user message folded from the session log;
 *   2. archives the selected sessions with `stopActivity: true` — the same
 *      durable write the workspace grouping surface performs, but issued in
 *      batch, so a pile of ungrouped test conversations clears in one click.
 *
 * Deleting here means *archiving*: sessions vanish from every grouping
 * surface but stay on disk and can be restored from the web UI's archived
 * list, or via POST /ungrouped-sweeper/api/v1/restore. No log bytes are
 * touched, so an accidental click is always recoverable.
 *
 * Everything comes from the host context (`webServer`, `connection`,
 * `workspaceRegistry`, `sessionPersistence`); the package carries zero
 * dependencies. On profiles without a `webServer` (tui, headless) the
 * plugin simply stays idle.
 *
 * Developed against DSH 0.2.0-rc.2.
 * @module dsh-ungrouped-sweeper
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readdir, readFile, rm } from 'node:fs/promises';

/** Stable cordis plugin name, surfaced in diagnostics. */
export const name = 'ungrouped-sweeper';

const HOME = homedir();
const SESSIONS_ROOT = join(HOME, '.dsh', 'sessions');
const PROJ_CACHE_ROOT = join(HOME, '.dsh', 'storages', 'session_projcache', 'sessions');
const PAGE_PATH = new URL('../page/index.html', import.meta.url);
const TITLE_CACHE = new Map();

/** Maximum bytes accepted on POST bodies; far above any legitimate payload. */
const BODY_LIMIT = 1 << 20;
/** First-user-text sample window; the first lines of a log are well under this. */
const TITLE_SAMPLE_BYTES = 64 << 10;
/** The zstd binary, resolved once: the absolute stock path when it exists. */
const ZSTD = existsSync('/usr/bin/zstd') ? '/usr/bin/zstd' : 'zstd';

/**
 * Resolve a session's display title.
 *
 * Primary source is the host's own projection cache: when the
 * `dsh-session-title` service is mounted it folds a `session/title` event
 * per session and persists it as plaintext JSON under
 * `~/.dsh/storages/session_projcache/`, so titles arrive with one
 * `readFile` and zero decompression. When the cache offers nothing, the
 * session log is folded instead — the last `session/title` event, else the
 * first user message — located by scanning the per-project directories
 * under `~/.dsh/sessions` rather than re-deriving dsh's internal
 * workspace-dir slug. Results are cached per session id.
 * @param {string} sessionId - e.g. `session-151c04ca-…`.
 * @returns {Promise<string|undefined>} trimmed, at most 80 chars.
 */
export async function sessionTitle(sessionId) {
  const cached = TITLE_CACHE.get(sessionId);
  if (cached !== undefined) return cached;
  const title = await readCachedTitle(sessionId) ?? await readLogTitle(sessionId);
  TITLE_CACHE.set(sessionId, title);
  return title;
}

/** Title from the host's `dsh-session-title` projection cache (plaintext JSON). */
async function readCachedTitle(sessionId) {
  let raw;
  try {
    raw = await readFile(join(PROJ_CACHE_ROOT, `${sessionId}.json`), 'utf8');
  } catch {
    return undefined; // not cached yet, or the cache is disabled
  }
  try {
    const rows = JSON.parse(raw)?.record?.rows;
    const official = rows?.title?.val;
    const first = rows?.titleInput?.val?.first?.text;
    for (const candidate of [official, first]) {
      if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim().slice(0, 80);
    }
  } catch { /* torn or unexpected cache row — fall through to the log */ }
  return undefined;
}

/** Title folded from the zstd-compressed session log, wherever it lives on disk. */
async function readLogTitle(sessionId) {
  let dirs;
  try {
    dirs = await readdir(SESSIONS_ROOT);
  } catch {
    return undefined; // no sessions root in this deployment
  }
  for (const dir of dirs) {
    const file = join(SESSIONS_ROOT, dir, sessionId, 'session.v4.jsonl.zstd');
    if (existsSync(file)) return foldLogTitle(file);
  }
  return undefined;
}

/**
 * Decompress at most {@link TITLE_SAMPLE_BYTES} of a session's event log and
 * return its title: the last `session/title` event in the sample, else the
 * first user-authored text. The JSONL backend stores logs as zstd frames, so
 * this shells out to the `zstd` binary and kills it after the sample window —
 * no full-decompress cost for long sessions.
 */
async function foldLogTitle(file) {
  const text = await new Promise((resolve) => {
    const child = spawn(ZSTD, ['-dc', file], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (out.length >= TITLE_SAMPLE_BYTES) {
        child.kill('SIGKILL');
        resolve(out);
      }
    });
    child.on('close', () => resolve(out));
    child.on('error', () => resolve(''));
    const killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already gone */ } }, 4000);
    killTimer.unref?.();
  });
  let titled;
  let firstUser;
  for (const line of text.split('\n')) {
    if (line === '') continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    // Titles arrive as durable `session/title` events; the last one wins.
    if (event?.type === 'session/title') {
      const value = event?.data?.title;
      if (typeof value === 'string' && value.trim() !== '') titled = value.trim();
      continue;
    }
    // v4 format: user turns enter the log as inbox splices.
    if (event?.type !== 'agent/inbox/spliced' || firstUser !== undefined) continue;
    const message = (event?.data?.inserted ?? []).find((m) => m?.role === 'user');
    if (message === undefined) continue;
    const parts = Array.isArray(message.content) ? message.content : [{ text: message.content }];
    const first = parts.find((part) => typeof part?.text === 'string' && part.text.trim() !== '');
    if (first !== undefined) firstUser = first.text.trim();
  }
  return (titled ?? firstUser)?.slice(0, 80);
}

/**
 * Remove every on-disk artifact of a stored session: the per-project log
 * directory (wherever it lives under the sessions root) and the host's
 * projection-cache row. Only ever called for sessions already in the
 * registry's archive set.
 */
async function purgeSessionFiles(sessionId) {
  let dirs = [];
  try { dirs = await readdir(SESSIONS_ROOT); } catch { /* no sessions root */ }
  let removed = 0;
  for (const dir of dirs) {
    const target = join(SESSIONS_ROOT, dir, sessionId);
    if (!existsSync(target)) continue;
    await rm(target, { recursive: true, force: true });
    removed += 1;
  }
  await rm(join(PROJ_CACHE_ROOT, `${sessionId}.json`), { force: true });
  TITLE_CACHE.delete(sessionId);
  return removed;
}

/** Serialise a JSON response. */
function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(body);
}

/** Read a request body with the {@link BODY_LIMIT} cap applied. */
function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new Error('body too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

/**
 * Whether this request was already refused by the host's admission gate.
 *
 * Plugin routes live on the same webServer as the authenticated GUI, but a
 * host may only fence its own paths — the market wraps its handlers with
 * `connection.requestRejection` for exactly this reason, and so does this
 * plugin: every route re-checks before answering.
 */
function refused(request, response, hostCtx) {
  const connection = typeof hostCtx?.get === 'function' ? hostCtx.get('connection') : hostCtx?.connection;
  const reject = connection?.requestRejection;
  if (typeof reject !== 'function') return false;
  const status = reject.call(connection, request);
  if (status === undefined) return false;
  sendJson(response, status, { error: 'unauthorized' });
  return true;
}

/** Whether a session header marks a subagent (or other non-user-facing) session. */
function isSubagent(header) {
  return header?.origin === 'subagent'
    || (typeof header?.delegationDepth === 'number' && header.delegationDepth > 0)
    || (header?.parentSession !== undefined && header?.parentSession !== null);
}

/** One session row for the list endpoint and the page. */
function rowOf(header, snapshot, workspaces, archivedSet, pinnedSet) {
  const id = header.id;
  const workspace = workspaces.find((w) => w.sessionIds.includes(id));
  return {
    id,
    createdAt: header.createdAt,
    cwd: header.cwd ?? null,
    workspaceId: workspace?.workspaceId ?? null,
    workspaceTitle: workspace?.title ?? null,
    archived: archivedSet.has(id),
    pinned: pinnedSet.has(id),
    subagent: isSubagent(header),
    sizeBytes: snapshot?.sizeBytes,
    title: null,
  };
}

/**
 * Mount the sweeper's HTTP surface.
 * @param ctx - host context carrying `webServer`, `workspaceRegistry`,
 *   `sessionPersistence`, and (for the auth gate) `connection`.
 */
export function apply(ctx) {
  ctx.inject(['webServer', 'workspaceRegistry', 'sessionPersistence'], (hostCtx) => {
    const webServer = hostCtx.webServer;
    const registry = hostCtx.workspaceRegistry;
    const persistence = hostCtx.sessionPersistence;

    const listRoute = webServer.register({
      kind: 'exact',
      path: '/ungrouped-sweeper/api/v1/list',
      handler: async (request, response) => {
        if (refused(request, response, hostCtx)) return;
        if (request.method !== 'GET') { response.writeHead(405, { allow: 'GET' }); response.end(); return; }
        try {
          const snapshots = await persistence.list();
          const workspaces = registry.list().map((entity) => ({
            workspaceId: entity.id,
            title: entity.title,
            path: entity.path,
            sessionIds: [...entity.sessionIds],
          }));
          const archivedSet = new Set(registry.archivedSessionIds);
          const pinned = typeof registry.pinnedSessionIds === 'function' ? registry.pinnedSessionIds() : (registry.pinnedSessionIds ?? []);
          const pinnedSet = new Set(pinned);
          const rows = snapshots.map((snapshot) => rowOf(snapshot.header, snapshot, workspaces, archivedSet, pinnedSet));
          await Promise.all(rows.map(async (row) => {
            if (!row.subagent) row.title = (await sessionTitle(row.id)) ?? null;
          }));
          rows.sort((a, b) => b.createdAt - a.createdAt);
          sendJson(response, 200, { generatedAt: Date.now(), workspaces, sessions: rows });
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      },
    });

    const deleteRoute = webServer.register({
      kind: 'exact',
      path: '/ungrouped-sweeper/api/v1/delete',
      handler: async (request, response) => {
        if (refused(request, response, hostCtx)) return;
        if (request.method !== 'POST') { response.writeHead(405, { allow: 'POST' }); response.end(); return; }
        let body;
        try { body = JSON.parse(await readBody(request) || '{}'); } catch { sendJson(response, 400, { error: 'invalid JSON body' }); return; }
        let ids = Array.isArray(body?.sessionIds) ? body.sessionIds.filter((id) => typeof id === 'string') : [];
        if (body?.scope === 'ungrouped') {
          const snapshots = await persistence.list();
          const workspaces = registry.list();
          const grouped = new Set(workspaces.flatMap((w) => [...w.sessionIds]));
          const archived = new Set(registry.archivedSessionIds);
          ids = snapshots
            .filter((snapshot) => !isSubagent(snapshot.header))
            .map((snapshot) => snapshot.header.id)
            .filter((id) => !grouped.has(id) && !archived.has(id));
        }
        const archived = [];
        const failed = [];
        for (const id of ids) {
          try {
            await registry.archiveSession(id, { stopActivity: true });
            archived.push(id);
          } catch (error) {
            failed.push({ id, error: error instanceof Error ? error.message : String(error) });
          }
        }
        sendJson(response, 200, { archived, failed });
      },
    });

    const restoreRoute = webServer.register({
      kind: 'exact',
      path: '/ungrouped-sweeper/api/v1/restore',
      handler: async (request, response) => {
        if (refused(request, response, hostCtx)) return;
        if (request.method !== 'POST') { response.writeHead(405, { allow: 'POST' }); response.end(); return; }
        let body;
        try { body = JSON.parse(await readBody(request) || '{}'); } catch { sendJson(response, 400, { error: 'invalid JSON body' }); return; }
        const ids = Array.isArray(body?.sessionIds) ? body.sessionIds.filter((id) => typeof id === 'string') : [];
        const restored = [];
        const failed = [];
        for (const id of ids) {
          try { await registry.unarchiveSession(id); restored.push(id); }
          catch (error) { failed.push({ id, error: error instanceof Error ? error.message : String(error) }); }
        }
        sendJson(response, 200, { restored, failed });
      },
    });

    const purgeRoute = webServer.register({
      kind: 'exact',
      path: '/ungrouped-sweeper/api/v1/purge',
      handler: async (request, response) => {
        if (refused(request, response, hostCtx)) return;
        if (request.method !== 'POST') { response.writeHead(405, { allow: 'POST' }); response.end(); return; }
        let body;
        try { body = JSON.parse(await readBody(request) || '{}'); } catch { sendJson(response, 400, { error: 'invalid JSON body' }); return; }
        const ids = Array.isArray(body?.sessionIds) ? body.sessionIds.filter((id) => typeof id === 'string') : [];
        const archivedSet = new Set(registry.archivedSessionIds);
        const purged = [];
        const skipped = [];
        const failed = [];
        for (const id of ids) {
          // Hard delete is only offered for sessions already in the archive
          // set — the reversible buffer stays the safety net. Archived
          // sessions have no live writer (archiving stopped their work), so
          // the files can simply go.
          if (!archivedSet.has(id)) { skipped.push({ id, reason: 'not archived' }); continue; }
          try {
            // First drop the id from the official archive set, then remove
            // the bytes; the registry tolerates ids of vanished sessions.
            await registry.unarchiveSession(id);
            const dirs = await purgeSessionFiles(id);
            purged.push({ id, logDirs: dirs });
          } catch (purgeError) {
            failed.push({ id, error: purgeError instanceof Error ? purgeError.message : String(purgeError) });
          }
        }
        sendJson(response, 200, { purged, skipped, failed });
      },
    });

    const pageRoute = webServer.register({
      kind: 'exact',
      path: '/ungrouped-sweeper',
      handler: async (request, response) => {
        if (refused(request, response, hostCtx)) return;
        if (request.method !== 'GET') { response.writeHead(405, { allow: 'GET' }); response.end(); return; }
        const html = await readFile(PAGE_PATH, 'utf8').catch(() => undefined);
        if (html === undefined) {
          response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
          response.end('ungrouped-sweeper: page/index.html missing from the installation');
          return;
        }
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        response.end(html);
      },
    });

    hostCtx.logger?.info?.('[ungrouped-sweeper] routes mounted: /ungrouped-sweeper (page), /ungrouped-sweeper/api/v1/{list,delete,restore,purge}');

    return () => {
      for (const dispose of [listRoute, deleteRoute, restoreRoute, purgeRoute, pageRoute]) {
        try { dispose?.(); } catch { /* already disposed */ }
      }
    };
  });
}
