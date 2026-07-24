/**
 * dlqApi.js — Frontend API client for DLQ and metrics endpoints.
 *
 * All requests use authFetch() so the Authorization header is automatically
 * attached and access tokens are silently refreshed on 401.
 */

import { authFetch, API_ORIGIN } from "./apiClient";

const DLQ_BASE = `${API_ORIGIN}/dlq`;
const METRICS_BASE = `${API_ORIGIN}/metrics`;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function handleResponse(res) {
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || payload?.message || `HTTP ${res.status}`);
  }
  return payload;
}

// ── DLQ API ──────────────────────────────────────────────────────────────────

/**
 * List DLQ entries with optional cursor-based pagination.
 *
 * @param {object} [opts]
 * @param {string} [opts.cursor="-"]  - Stream cursor for pagination
 * @param {number} [opts.count=50]    - Max entries per page
 */
export async function listDLQ({ cursor = "-", count = 50 } = {}) {
  const params = new URLSearchParams({ cursor, count: String(count) });
  const res = await authFetch(`${DLQ_BASE}?${params}`);
  return handleResponse(res);
}

/**
 * Fetch a single DLQ entry by its Redis Stream ID.
 *
 * @param {string} id - Redis Stream entry ID
 */
export async function getDLQEntry(id) {
  const res = await authFetch(`${DLQ_BASE}/${encodeURIComponent(id)}`);
  return handleResponse(res);
}

/**
 * Replay a single failed log back into the main ingestion stream.
 *
 * @param {string} id - Redis Stream entry ID
 */
export async function replayOne(id) {
  const res = await authFetch(
    `${DLQ_BASE}/replay/${encodeURIComponent(id)}`,
    { method: "POST" }
  );
  return handleResponse(res);
}

/**
 * Replay ALL entries in the DLQ back into the main ingestion stream.
 */
export async function replayAll() {
  const res = await authFetch(`${DLQ_BASE}/replay`, { method: "POST" });
  return handleResponse(res);
}

/**
 * Permanently delete a DLQ entry (no replay).
 *
 * @param {string} id - Redis Stream entry ID
 */
export async function deleteDLQEntry(id) {
  const res = await authFetch(
    `${DLQ_BASE}/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
  if (res.status === 204) return { deleted: true };
  return handleResponse(res);
}

// ── Metrics API ───────────────────────────────────────────────────────────────

/**
 * Fetch the ingestion pipeline metrics snapshot.
 */
export async function getMetrics() {
  const res = await authFetch(METRICS_BASE);
  return handleResponse(res);
}
