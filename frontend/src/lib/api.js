const TOKEN_KEY = "sm_token";
const API_BASE = import.meta.env.VITE_API_URL || "";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function failWith(response, data, auth) {
  if (response.status === 401 && auth) {
    setToken(null);
    window.dispatchEvent(new Event("sm:unauthorized"));
  }
  let message = `Something went wrong (HTTP ${response.status}). Please try again.`;
  if (typeof data === "string" && data.trim() && data.length < 400) {
    message = data.trim();
  } else if (typeof data?.detail === "string") message = data.detail;
  else if (Array.isArray(data?.detail) && data.detail.length) {
    message = data.detail.map((row) => row.msg || "Invalid value").join(", ");
  }
  throw new Error(message);
}

async function readBody(response) {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = {};
  const token = getToken();
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Cannot reach the server. Is the backend running?");
  }

  const data = await readBody(response);
  if (!response.ok) failWith(response, data, auth);
  return data;
}

async function requestForm(path, formData) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: formData });
  } catch {
    throw new Error("Cannot reach the server. Is the backend running?");
  }

  const data = await readBody(response);
  if (!response.ok) failWith(response, data, true);
  return data;
}

export const api = {
  // auth
  login: (payload) => request("/api/auth/login", { method: "POST", body: payload, auth: false }),
  register: (payload) => request("/api/auth/register", { method: "POST", body: payload, auth: false }),
  me: () => request("/api/auth/me"),
  updateProfile: (payload) => request("/api/auth/me", { method: "PUT", body: payload }),
  changePassword: (payload) => request("/api/auth/change-password", { method: "POST", body: payload }),

  // items
  items: (query = "") => request(`/api/items${query}`),
  categories: () => request("/api/items/categories"),
  item: (id) => request(`/api/items/${id}`),
  createItem: (payload) => request("/api/items", { method: "POST", body: payload }),
  updateItem: (id, payload) => request(`/api/items/${id}`, { method: "PUT", body: payload }),
  deleteItem: (id) => request(`/api/items/${id}`, { method: "DELETE" }),
  restock: (id, payload) => request(`/api/items/${id}/restock`, { method: "POST", body: payload }),
  itemHistory: (id) => request(`/api/items/${id}/history`),

  // issues
  issues: (query = "") => request(`/api/issues${query}`),
  issue: (payload) => request("/api/issues", { method: "POST", body: payload }),
  returnIssue: (id, payload) => request(`/api/issues/${id}/return`, { method: "POST", body: payload }),
  cancelIssue: (id) => request(`/api/issues/${id}`, { method: "DELETE" }),

  // dashboard + settings
  dashboard: () => request("/api/dashboard"),
  settings: () => request("/api/settings"),
  updateSettings: (payload) => request("/api/settings", { method: "PUT", body: payload }),

  // members
  members: (query = "") => request(`/api/members${query}`),
  createMember: (payload) => request("/api/members", { method: "POST", body: payload }),
  deleteMember: (id) => request(`/api/members/${id}`, { method: "DELETE" }),

  // stationery register
  stationery: (query = "") => request(`/api/stationery${query}`),
  createStationery: (payload) => request("/api/stationery", { method: "POST", body: payload }),
  updateStationery: (id, payload) => request(`/api/stationery/${id}`, { method: "PUT", body: payload }),
  deleteStationery: (id) => request(`/api/stationery/${id}`, { method: "DELETE" }),
  bulkStationery: (rows) => request("/api/stationery/bulk", { method: "POST", body: { rows } }),
  stationeryColumns: () => request("/api/stationery/columns"),
  addStationeryColumn: (payload) => request("/api/stationery/columns", { method: "POST", body: payload }),
  deleteStationeryColumn: (id) => request(`/api/stationery/columns/${id}`, { method: "DELETE" }),
  stationeryOverview: () => request("/api/stationery/overview"),
  stockOut: (query = "") => request(`/api/stationery/out${query}`),
  createStockOut: (payload) => request("/api/stationery/out", { method: "POST", body: payload }),
  approveStockOut: (id) => request(`/api/stationery/out/${id}/approve`, { method: "POST" }),
  rejectStockOut: (id) => request(`/api/stationery/out/${id}/reject`, { method: "POST" }),
  deleteStockOut: (id) => request(`/api/stationery/out/${id}`, { method: "DELETE" }),
  previewStationeryImport: (file) => {
    const form = new FormData();
    form.append("file", file);
    return requestForm("/api/stationery/import/preview", form);
  },
  importStationery: (file, mapping) => {
    const form = new FormData();
    form.append("file", file);
    form.append("mapping", JSON.stringify(mapping));
    return requestForm("/api/stationery/import", form);
  },
};
