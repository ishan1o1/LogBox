import { authFetch, API_ORIGIN } from "./apiClient";

const RCA_BASE_URL = `${API_ORIGIN}${import.meta.env.VITE_RCA_API_BASE_PATH || "/rca"}`;

/**
 * Makes an authenticated GET request to a RCA endpoint.
 * Uses authFetch so the Authorization: Bearer <token> header is automatically
 * attached, and the token will be silently refreshed on 401.
 */
async function request(path, params = {}) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, value);
    }
  });

  const response = await authFetch(`${RCA_BASE_URL}${path}?${search.toString()}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || payload?.message || "Request failed");
  }

  return payload;
}

export function getGroupedIncidents(params) {
  return request("/incidents", params);
}

export function analyzeIncident(params) {
  return request("/analyze", params);
}
