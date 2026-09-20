const API = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('sahay_token') || sessionStorage.getItem('sahay_token');
}

function clearToken() {
  localStorage.removeItem('sahay_token');
  sessionStorage.removeItem('sahay_token');
}

export { getToken, clearToken };

export async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('sahay_token');
    sessionStorage.removeItem('sahay_token');
    if (!path.includes('/auth/login')) {
      window.location.href = '/login';
    }
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: 'Unable to load data.' };
  }
  if (!res.ok) {
    const err = new Error(data?.error || 'Unable to complete request.');
    err.details = data?.details;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body || {}) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body || {}) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body || {}) }),
};
