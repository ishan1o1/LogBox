import { authFetch, API_ORIGIN } from "./apiClient";

/**
 * Fetches analytics data from the server.
 * Uses authFetch so the Authorization: Bearer <token> header is automatically
 * attached, and the token will be silently refreshed on 401.
 *
 * @param {string|null} startTime - ISO timestamp for the analytics start window
 * @param {string|null} endTime   - ISO timestamp for the analytics end window
 */
async function fetchAnalytics(startTime, endTime) {
  const search = new URLSearchParams();

  if (startTime) {
    search.set("start", startTime);
  }
  if (endTime) {
    search.set("end", endTime);
  }

  const response = await authFetch(
    `${API_ORIGIN}/logs/analytics?${search.toString()}`
  );
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error || "Failed to load analytics");
  }

  return payload;
}

export { fetchAnalytics };
