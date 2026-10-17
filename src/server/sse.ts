import type http from "node:http";
import type { LearningState } from "../types.js";

/**
 * Registry of currently connected Server-Sent Events clients.
 *
 * A single module-level registry is used because the plugin runs at most one
 * dashboard server per process.
 */
const sseClients = new Set<http.ServerResponse>();

/** Register a new SSE client. */
export function addSseClient(client: http.ServerResponse): void {
  sseClients.add(client);
}

/** Remove a previously registered SSE client. */
export function removeSseClient(client: http.ServerResponse): void {
  sseClients.delete(client);
}

/** Broadcast a learning state payload to every connected SSE client. */
export function broadcast(state: LearningState): void {
  const data = `data: ${JSON.stringify(state)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(data);
    } catch {
      sseClients.delete(client);
    }
  }
}

/** End and clear every connected SSE client (used on server shutdown). */
export function closeAllSseClients(): void {
  for (const client of sseClients) {
    try {
      client.end();
    } catch {
      // Ignore
    }
  }
  sseClients.clear();
}
