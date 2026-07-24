const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || "http://localhost:4000";

function getAccessToken() {
  return localStorage.getItem("accessToken");
}

function getRefreshToken() {
  return localStorage.getItem("refreshToken");
}

function storeSession(payload) {
  if (payload?.accessToken) {
    localStorage.setItem("accessToken", payload.accessToken);
  }
  if (payload?.refreshToken) {
    localStorage.setItem("refreshToken", payload.refreshToken);
  }
  if (payload?.user) {
    localStorage.setItem("user", JSON.stringify(payload.user));
    localStorage.setItem("role", payload.user.role);
  }
}

function clearSession() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("user");
  localStorage.removeItem("role");
}

function withAuthHeaders(options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getAccessToken();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return { ...options, headers };
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return false;
  }

  const response = await fetch(`${API_ORIGIN}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    clearSession();
    return false;
  }

  const payload = await response.json();
  storeSession(payload);
  return true;
}

async function authFetch(url, options = {}) {
  let response = await fetch(url, withAuthHeaders(options));

  if (response.status === 401 && (await refreshAccessToken())) {
    response = await fetch(url, withAuthHeaders(options));
  }

  return response;
}

async function logoutSession() {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    await fetch(`${API_ORIGIN}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {});
  }
  clearSession();
}

export {
  API_ORIGIN,
  authFetch,
  clearSession,
  getAccessToken,
  getRefreshToken,
  logoutSession,
  storeSession,
};