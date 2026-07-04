// Authors: Leon Aburime using Claude Fable 5
// @ts-nocheck — carried over verbatim from server.ts's file-level @ts-nocheck.
// The moved body is untyped JS-in-TS (loose `let server`, the address union,
// unknown-typed reject paths); typing it is a later effort and new sibling code
// must NOT copy this.
/** @module server/bootstrap/start-listener
 * The daemon's `app.listen` binding + graceful-shutdown wiring — the last step
 * of startServer, after every route and service has been registered.
 *
 * Owns the promise contract three callers depend on (cli.ts, sidecar/server.ts,
 * version-route.test.ts): resolve only once the socket is actually bound, so the
 * resolved URL/port is real even for an ephemeral `port=0` bind, and always
 * settle (never hang) on EADDRINUSE / EACCES whether Node throws synchronously
 * or emits an `error` event.
 *
 * The three mutable runtime values the rest of startServer reads through getter
 * refs — the resolved port, the final daemon URL, and the shutting-down flag —
 * live in a shared `state` box passed in by startServer, so this listener can
 * write the bound port + URL back where the already-registered routes will see
 * them. The daemon-init singletons it drives on shutdown (design/runs+analytics,
 * terminal, orbit, routine, composio) are passed in explicitly; nothing here
 * depends back on server.ts.
 *
 * Extracted from apps/daemon/src/server.ts (strangler-fig bootstrap slice); the
 * body is otherwise byte-identical apart from the three mutable-local references
 * (`resolvedPort`/`daemonUrl`/`daemonShuttingDown`) becoming `state.*` fields.
 */

import { composioConnectorProvider } from '../../connectors/composio.js';
import { resolveChatRunShutdownGraceMs } from '../../runtimes/chat-run-lifecycle.js';
import { getRouteRegistrationInventory } from '../../route-registration-guard.js';

/**
 * Bind the daemon's HTTP server and wire graceful shutdown, returning the same
 * promise `startServer` has always returned: the resolved URL string, or —
 * when `returnServer` is set — a `{ url, server, shutdown, routeInventory }`
 * handle. Writes the bound port and final URL back into the shared `state` box
 * so the getter refs the routes closed over report the real values.
 *
 * @param deps.app - The fully-configured Express app (all routes registered).
 * @param deps.host - The bind host (already normalized).
 * @param deps.port - The requested port (0 for an ephemeral bind).
 * @param deps.returnServer - When true, resolve the richer server handle.
 * @param deps.state - Shared mutable box: `{ resolvedPort, daemonUrl, daemonShuttingDown }`.
 * @param deps.design - The design/runs+analytics service (drained on shutdown).
 * @param deps.terminalService - The terminal service (drained on shutdown).
 * @param deps.orbitService - The Orbit service (stopped on shutdown).
 * @param deps.routineService - The routine scheduler (stopped on shutdown; may be null).
 * @returns The daemon URL, or the server handle when `returnServer` is set.
 */
export function startDaemonListener({
  app,
  host,
  port,
  returnServer,
  state,
  design,
  terminalService,
  orbitService,
  routineService,
}) {
  return new Promise((resolve, reject) => {
    let daemonShutdownStarted = false;
    const cleanupDaemonBackgroundWork = () => {
      composioConnectorProvider.stopCatalogRefreshLoop();
      orbitService.stop();
      routineService?.stop();
    };
    const shutdownDaemonRuns = async () => {
      if (daemonShutdownStarted) return;
      daemonShutdownStarted = true;
      state.daemonShuttingDown = true;
      await design.runs.shutdownActive({ graceMs: resolveChatRunShutdownGraceMs() });
      await terminalService.shutdownActive();
      await design.analytics.shutdown();
    };
    let server;
    try {
      server = app.listen(port, host);
      server.once('listening', () => {
        // Widen the between-request idle window so kept-alive sockets
        // belonging to chat/SSE clients survive the gaps between bursts.
        //
        // Node's `keepAliveTimeout` (default 5s) only arms *after* a
        // response finishes writing, bounding the idle gap before the next
        // request on the same socket — it does not fire while an SSE
        // response is still streaming. A streaming `/api/runs/:id/events`
        // response stays open until the agent finishes, so middlebox idle
        // timers (nginx, socat/docker bridges, EC2 SG NAT) are typically
        // the proximate cause when an SSE stream drops; this listener-
        // side change cannot extend a connection past those middleboxes.
        //
        // What it *does* fix: chat clients that pipeline multiple requests
        // on the same TCP socket (status polls, run-status fetches, the
        // initial GET before the SSE upgrade). With the default 5s window
        // a sluggish client can lose the connection between two normal
        // calls and reconnect-storm. 120s aligns with the in-band
        // SSE_KEEPALIVE_INTERVAL_MS (25s) so kept-alive sockets used
        // around an SSE stream stay warm across reasonable client pauses.
        //
        // `headersTimeout` must exceed `keepAliveTimeout` per the Node
        // docs; otherwise a slow-loris client can stall request parsing.
        server.keepAliveTimeout = 120_000;
        server.headersTimeout = 125_000;
        const address = server.address();
        // `address()` can in theory return `string | AddressInfo | null`. For
        // a TCP listener it's always `AddressInfo` with a `.port` — the guard
        // is belt-and-braces so an unexpected null never silently produces a
        // `http://127.0.0.1:0` URL that callers would then try to fetch.
        const boundPort =
          address && typeof address === 'object' ? address.port : null;
        if (!boundPort) {
          reject(
            new Error(
              `[od] daemon failed to resolve listening port (address=${JSON.stringify(address)})`,
            ),
          );
          return;
        }
        state.resolvedPort = boundPort;
        // When binding to all interfaces report localhost for local callers;
        // when binding to a specific address (e.g. a Tailscale IP) report that
        // address so remote callers and the sidecar use the correct URL.
        const reportHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
        const url = `http://${reportHost}:${state.resolvedPort}`;
        if (!returnServer) {
          console.log(`[od] daemon listening on ${url}`);
        }
        state.daemonUrl = url;
        resolve(returnServer ? {
          url,
          server,
          shutdown: shutdownDaemonRuns,
          routeInventory: getRouteRegistrationInventory(app),
        } : url);
      });
    } catch (error) {
      cleanupDaemonBackgroundWork();
      reject(error);
      return;
    }
    server.once('close', () => {
      void shutdownDaemonRuns().finally(cleanupDaemonBackgroundWork);
    });
    // `app.listen` throws synchronously when the port is already in use on
    // some Node versions, but emits an `error` event on others (and for
    // EACCES / EADDRNOTAVAIL even on the same Node). Wire the event so the
    // returned Promise always settles instead of hanging forever.
    server.on('error', (error) => {
      cleanupDaemonBackgroundWork();
      reject(error);
    });
  });
}
